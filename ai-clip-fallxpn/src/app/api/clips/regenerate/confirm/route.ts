import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { applyRegeneratePreview, type RegeneratePreview } from "@/lib/regenerate/regenerate-service";

const previewSchema = z.object({
  clipId: z.string().cuid(),
  field: z.enum(["title", "description", "hashtags", "caption"]),
  currentValue: z.unknown(),
  proposedValue: z.unknown(),
});
const schema = z.object({ previews: z.array(previewSchema).min(1) });

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    const clipIds = [...new Set(parsed.data.previews.map((p) => p.clipId))];
    const owned = await prisma.clip.count({
      where: { id: { in: clipIds }, generation: { userId: user.id } },
    });
    if (owned !== clipIds.length) {
      return NextResponse.json({ error: "One or more clips were not found." }, { status: 404 });
    }

    for (const preview of parsed.data.previews) {
      await applyRegeneratePreview(preview as RegeneratePreview);
    }

    return NextResponse.json({ applied: parsed.data.previews.length });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("regenerate confirm error:", err);
    return NextResponse.json({ error: "Could not apply changes." }, { status: 500 });
  }
}
