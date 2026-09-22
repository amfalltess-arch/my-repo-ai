import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { clipGenerationQueue } from "@/lib/queue/queues";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const generation = await prisma.generation.findFirst({
      where: { id, userId: user.id },
      include: { clips: { where: { status: "FAILED" } } },
    });
    if (!generation) {
      return NextResponse.json({ error: "Generation not found." }, { status: 404 });
    }
    if (generation.clips.length === 0) {
      return NextResponse.json({ error: "No failed clips to retry." }, { status: 400 });
    }

    await prisma.clip.updateMany({
      where: { id: { in: generation.clips.map((c) => c.id) } },
      data: { status: "PENDING", failureReason: null },
    });

    await clipGenerationQueue.addBulk(
      generation.clips.map((clip) => ({
        name: "generate",
        data: { generationId: generation.id, clipId: clip.id },
      })),
    );

    await prisma.generation.update({
      where: { id: generation.id },
      data: { status: "GENERATING_CLIPS" },
    });

    return NextResponse.json({ retried: generation.clips.length });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("retry-failed error:", err);
    return NextResponse.json({ error: "Retry failed." }, { status: 500 });
  }
}
