import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { publishClipsSchema } from "@/lib/security/validation";
import { computeScheduleSlots } from "@/lib/tiktok/scheduler";
import { tiktokUploadQueue } from "@/lib/queue/queues";

/** Spec section 27: Publishing Queue page (Video, Account, Caption, Schedule, Status, Attempts, Created). */
export async function GET() {
  try {
    const user = await requireUser();
    const publishJobs = await prisma.publishJob.findMany({
      where: { clip: { generation: { userId: user.id } } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        clip: { select: { id: true, index: true, title: true, thumbnailStorageKey: true } },
        tiktokAccount: { select: { username: true, avatarUrl: true } },
      },
    });
    return NextResponse.json({ publishJobs });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("publish queue list error:", err);
    return NextResponse.json({ error: "Could not load the publishing queue." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = publishClipsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const account = await prisma.tikTokAccount.findFirst({
      where: { id: parsed.data.tiktokAccountId, userId: user.id, status: "connected" },
    });
    if (!account) {
      return NextResponse.json({ error: "TikTok account not found or not connected." }, { status: 400 });
    }

    const clips = await prisma.clip.findMany({
      where: {
        id: { in: parsed.data.clipIds },
        status: "READY",
        generation: { userId: user.id },
      },
      orderBy: { index: "asc" },
    });
    if (clips.length === 0) {
      return NextResponse.json({ error: "No ready clips found for the given IDs." }, { status: 400 });
    }

    // Spec section 24: "Jangan melakukan 40 request secara bersamaan" — even
    // a "publish now" batch is spread out a few seconds apart rather than
    // fired all at once, and a real multi-slot schedule spaces them per the
    // chosen interval.
    const slots = parsed.data.schedule
      ? computeScheduleSlots({
          startAt: new Date(parsed.data.schedule.startAt),
          intervalMin: parsed.data.schedule.intervalMin,
          timezone: parsed.data.schedule.timezone,
          count: clips.length,
        })
      : clips.map((_, i) => new Date(Date.now() + i * 12_000));

    const publishJobs = await prisma.$transaction(
      clips.map((clip, i) =>
        prisma.publishJob.create({
          data: {
            clipId: clip.id,
            tiktokAccountId: account.id,
            caption: [clip.title, clip.description].filter(Boolean).join("\n\n"),
            privacyLevel: parsed.data.privacyLevel,
            scheduledFor: slots[i],
            status: "WAITING",
          },
        }),
      ),
    );

    for (let i = 0; i < publishJobs.length; i++) {
      const publishJob = publishJobs[i]!;
      const scheduledFor = slots[i]!;
      await tiktokUploadQueue.add(
        "upload",
        { publishJobId: publishJob.id },
        { delay: Math.max(0, scheduledFor.getTime() - Date.now()) },
      );
    }

    return NextResponse.json({ queued: publishJobs.length });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("tiktok publish error:", err);
    return NextResponse.json({ error: "Could not queue publishing." }, { status: 500 });
  }
}
