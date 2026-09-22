import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await requireAdmin();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, email: true, name: true, role: true, createdAt: true,
        maxVideosPerGeneration: true, maxVideoDurationSec: true, maxUploadSizeMb: true,
        dailyGenerationLimit: true, concurrentJobLimit: true,
        _count: { select: { videos: true, generations: true } },
      },
    });
    return NextResponse.json({ users });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("admin users list error:", err);
    return NextResponse.json({ error: "Could not load users." }, { status: 500 });
  }
}
