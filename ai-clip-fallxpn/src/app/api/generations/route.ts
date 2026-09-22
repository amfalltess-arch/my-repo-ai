import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createGenerationSchema } from "@/lib/security/validation";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/security/rate-limit";
import { videoAnalysisQueue } from "@/lib/queue/queues";
import { publishProgress } from "@/lib/queue/progress";
import { getGenerationDefaults } from "@/lib/settings/generation-defaults";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const defaults = await getGenerationDefaults();

    const limit = Number(process.env.RATE_LIMIT_GENERATION_PER_HOUR ?? 10);
    await enforceRateLimit({ key: `generation-create:${user.id}`, limit, windowSeconds: 3600 });

    const body = await request.json();
    const parsed = createGenerationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const input = parsed.data;

    // Spec section 33: admin-configured per-user caps override the global default (section 31).
    const effectiveMax = Math.min(
      dbUser.maxVideosPerGeneration ?? defaults.maxVideoCount,
      defaults.maxVideoCount,
    );
    if (input.videoCount > effectiveMax) {
      return NextResponse.json(
        { error: `Maximum ${effectiveMax} videos per generation on your account.` },
        { status: 400 },
      );
    }

    if (dbUser.dailyGenerationLimit) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const countToday = await prisma.generation.count({
        where: { userId: user.id, createdAt: { gte: since } },
      });
      if (countToday >= dbUser.dailyGenerationLimit) {
        return NextResponse.json(
          { error: `Daily generation limit (${dbUser.dailyGenerationLimit}) reached.` },
          { status: 429 },
        );
      }
    }

    const video = await prisma.video.findFirst({
      where: { id: input.videoId, userId: user.id },
    });
    if (!video) {
      return NextResponse.json({ error: "Video not found." }, { status: 404 });
    }

    if (input.autoPostEnabled && input.tiktokAccountId) {
      const account = await prisma.tikTokAccount.findFirst({
        where: { id: input.tiktokAccountId, userId: user.id, status: "connected" },
      });
      if (!account) {
        return NextResponse.json(
          { error: "Selected TikTok account is not connected." },
          { status: 400 },
        );
      }
    }

    const generation = await prisma.generation.create({
      data: {
        video: { connect: { id: video.id } },
        user: { connect: { id: user.id } },
        requestedCount: input.videoCount,
        contentType: input.contentType,
        clipLengthMinSec: input.clipLengthMinSec,
        clipLengthMaxSec: input.clipLengthMaxSec,
        aspectRatio: input.aspectRatio,
        subtitleEnabled: input.subtitleEnabled,
        subtitleStyle: input.subtitleStyle,
        contentTemplate: input.contentTemplateId
          ? { connect: { id: input.contentTemplateId } }
          : undefined,
        textVariantCount: input.textVariantCount,
        batchTextMode: input.batchTextMode,
        autoPostEnabled: input.autoPostEnabled,
        status: "QUEUED",
        ...(input.schedule
          ? {
              schedule: {
                create: {
                  startAt: new Date(input.schedule.startAt),
                  intervalMin: input.schedule.intervalMin,
                  timezone: input.schedule.timezone,
                },
              },
            }
          : {}),
      },
    });

    await publishProgress({
      generationId: generation.id,
      status: "QUEUED",
      progress: 0,
      currentStep: "Queued",
    });

    await videoAnalysisQueue.add("analyze", { generationId: generation.id });

    return NextResponse.json({ generation });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json({ error: "Too many generations requested. Please slow down." }, { status: 429 });
    }
    console.error("generation create error:", err);
    return NextResponse.json({ error: "Could not start generation." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    const generations = await prisma.generation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { video: true, _count: { select: { clips: true } } },
    });
    return NextResponse.json({ generations });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("generation list error:", err);
    return NextResponse.json({ error: "Could not load generations." }, { status: 500 });
  }
}
