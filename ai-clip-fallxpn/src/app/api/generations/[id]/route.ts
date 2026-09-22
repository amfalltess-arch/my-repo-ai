import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getStorageDriver } from "@/lib/storage/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const generation = await prisma.generation.findFirst({
      where: { id, userId: user.id },
      include: {
        video: true,
        contentTemplate: true,
        clips: {
          orderBy: { index: "asc" },
          include: { textVariants: true, publishJobs: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
      },
    });
    if (!generation) {
      return NextResponse.json({ error: "Generation not found." }, { status: 404 });
    }

    const storage = await getStorageDriver();
    const clipsWithUrls = await Promise.all(
      generation.clips.map(async (clip) => ({
        ...clip,
        videoUrl: clip.renderedStorageKey
          ? await storage.getPublicUrl(clip.renderedStorageKey)
          : null,
        thumbnailUrl: clip.thumbnailStorageKey
          ? await storage.getPublicUrl(clip.thumbnailStorageKey)
          : null,
      })),
    );

    return NextResponse.json({ generation: { ...generation, clips: clipsWithUrls } });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("generation detail error:", err);
    return NextResponse.json({ error: "Could not load generation." }, { status: 500 });
  }
}
