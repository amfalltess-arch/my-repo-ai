import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getGenerationDefaults, setGenerationDefaults } from "@/lib/settings/generation-defaults";

const patchSchema = z.object({
  defaultVideoCount: z.number().int().min(1).max(200).optional(),
  maxVideoCount: z.number().int().min(1).max(200).optional(),
  defaultClipMinSec: z.number().int().min(5).optional(),
  defaultClipMaxSec: z.number().int().min(5).optional(),
  defaultAspectRatio: z.enum(["RATIO_9_16", "RATIO_1_1", "RATIO_16_9"]).optional(),
  defaultSubtitleEnabled: z.boolean().optional(),
  defaultSubtitleStyle: z.string().optional(),
  defaultAiProvider: z.enum(["GEMINI", "CUSTOM"]).optional(),
  defaultContentTemplateId: z.string().cuid().nullable().optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ defaults: await getGenerationDefaults() });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("admin settings get error:", err);
    return NextResponse.json({ error: "Could not load settings." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }
    const defaults = await setGenerationDefaults(parsed.data);
    await prisma.auditLog.create({
      data: { userId: admin.id, action: "generation_defaults_updated", metadata: parsed.data },
    }).catch(() => undefined);
    return NextResponse.json({ defaults });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("admin settings update error:", err);
    return NextResponse.json({ error: "Could not save settings." }, { status: 500 });
  }
}
