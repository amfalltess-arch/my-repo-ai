import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { tiktokUploadQueue } from "@/lib/queue/queues";
import { cancelPublish } from "@/lib/tiktok/content-posting";
import { getValidAccessToken } from "@/lib/tiktok/token-manager";

async function loadOwnedPublishJob(id: string, userId: string) {
  return prisma.publishJob.findFirst({
    where: { id, clip: { generation: { userId } } },
  });
}

/** Retry a failed publish job. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const publishJob = await loadOwnedPublishJob(id, user.id);
    if (!publishJob) return NextResponse.json({ error: "Not found." }, { status: 404 });

    await prisma.publishJob.update({
      where: { id },
      data: { status: "RETRYING", lastError: null },
    });
    await tiktokUploadQueue.add("upload", { publishJobId: id });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("publish retry error:", err);
    return NextResponse.json({ error: "Could not retry." }, { status: 500 });
  }
}

/** Cancel a waiting/scheduled publish job. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const publishJob = await loadOwnedPublishJob(id, user.id);
    if (!publishJob) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (publishJob.publishId && publishJob.status === "UPLOADING") {
      const accessToken = await getValidAccessToken(publishJob.tiktokAccountId);
      await cancelPublish({ accessToken, publishId: publishJob.publishId });
    }

    await prisma.publishJob.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("publish cancel error:", err);
    return NextResponse.json({ error: "Could not cancel." }, { status: 500 });
  }
}
