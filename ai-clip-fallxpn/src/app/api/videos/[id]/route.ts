import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const video = await prisma.video.findFirst({
      where: { id, userId: user.id },
      include: { generations: { orderBy: { createdAt: "desc" } } },
    });
    if (!video) {
      return NextResponse.json({ error: "Video not found." }, { status: 404 });
    }
    return NextResponse.json({ video });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("video detail error:", err);
    return NextResponse.json({ error: "Could not load video." }, { status: 500 });
  }
}
