import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const updateUserSchema = z.object({
  role: z.enum(["USER", "ADMIN"]).optional(),
  maxVideosPerGeneration: z.number().int().min(1).max(200).nullable().optional(),
  maxVideoDurationSec: z.number().int().min(60).nullable().optional(),
  maxUploadSizeMb: z.number().int().min(1).nullable().optional(),
  dailyGenerationLimit: z.number().int().min(1).nullable().optional(),
  concurrentJobLimit: z.number().int().min(1).max(20).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    if (id === admin.id && parsed.data.role === "USER") {
      return NextResponse.json({ error: "You cannot demote your own account." }, { status: 400 });
    }

    const user = await prisma.user.update({ where: { id }, data: parsed.data });
    await prisma.auditLog.create({
      data: { userId: admin.id, action: "user_limits_updated", metadata: { targetUserId: id, ...parsed.data } },
    });

    return NextResponse.json({ user: { ...user, passwordHash: undefined } });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("admin user update error:", err);
    return NextResponse.json({ error: "Could not update user." }, { status: 500 });
  }
}
