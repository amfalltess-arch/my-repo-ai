import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { updateClipSchema } from "@/lib/security/validation";
import { getStorageDriver } from "@/lib/storage/storage";

async function loadOwnedClip(clipId: string, userId: string) {
  return prisma.clip.findFirst({
    where: { id: clipId, generation: { userId } },
    include: { generation: true, textVariants: true },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const clip = await loadOwnedClip(id, user.id);
    if (!clip) return NextResponse.json({ error: "Clip not found." }, { status: 404 });

    const storage = await getStorageDriver();
    return NextResponse.json({
      clip: {
        ...clip,
        videoUrl: clip.renderedStorageKey ? await storage.getPublicUrl(clip.renderedStorageKey) : null,
        thumbnailUrl: clip.thumbnailStorageKey ? await storage.getPublicUrl(clip.thumbnailStorageKey) : null,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("clip get error:", err);
    return NextResponse.json({ error: "Could not load clip." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const clip = await loadOwnedClip(id, user.id);
    if (!clip) return NextResponse.json({ error: "Clip not found." }, { status: 404 });

    const body = await request.json();
    const parsed = updateClipSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await prisma.clip.update({
      where: { id: clip.id },
      data: parsed.data,
    });
    return NextResponse.json({ clip: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("clip update error:", err);
    return NextResponse.json({ error: "Could not update clip." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const clip = await loadOwnedClip(id, user.id);
    if (!clip) return NextResponse.json({ error: "Clip not found." }, { status: 404 });

    const storage = await getStorageDriver();
    if (clip.renderedStorageKey) await storage.delete(clip.renderedStorageKey).catch(() => undefined);
    if (clip.thumbnailStorageKey) await storage.delete(clip.thumbnailStorageKey).catch(() => undefined);

    await prisma.clip.delete({ where: { id: clip.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("clip delete error:", err);
    return NextResponse.json({ error: "Could not delete clip." }, { status: 500 });
  }
}
