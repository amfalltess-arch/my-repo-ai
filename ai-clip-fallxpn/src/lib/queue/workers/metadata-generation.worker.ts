import { Worker, type Job } from "bullmq";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { getAIProvider } from "@/lib/ai";
import { assembleCaption } from "@/lib/template/render-template";
import { computeScheduleSlots } from "@/lib/tiktok/scheduler";
import { publishProgress } from "@/lib/queue/progress";
import { tiktokUploadQueue, type GenerationJobData } from "@/lib/queue/queues";
import { cleanupWorkDir } from "@/lib/queue/work-dir";
import type { Clip, ContentTemplate } from "@prisma/client";

/**
 * Resolves description/hashtags per clip according to `batchTextMode`
 * (spec section 16). The four modes only really differ in whether
 * description/hashtags are computed once and shared, or once per clip:
 *   - same_bio_same_all: one description+hashtags pair, reused for every clip
 *   - everything else: unique description+hashtags per clip (they naturally
 *     differ because each clip's transcript excerpt differs)
 * "Same bio" itself is handled separately below since the template's raw
 * text is inherently identical for every clip regardless of mode — what
 * varies between modes is only how much *else* is shared.
 */
async function resolveDescriptionAndHashtags(
  ai: Awaited<ReturnType<typeof getAIProvider>>,
  clip: Clip,
  transcriptExcerpt: string,
  contentType: string,
  batchTextMode: string,
  sharedCache: { description?: string; hashtags?: string[] },
) {
  if (batchTextMode === "same_bio_same_all" && sharedCache.description) {
    return { description: sharedCache.description, hashtags: sharedCache.hashtags! };
  }

  const description = await ai.generateDescription({
    transcriptExcerpt,
    title: clip.title ?? "",
    contentType,
  });
  const hashtags = await ai.generateHashtags({
    transcriptExcerpt,
    category: clip.category ?? "General",
    contentType,
  });

  if (batchTextMode === "same_bio_same_all") {
    sharedCache.description = description;
    sharedCache.hashtags = hashtags;
  }
  return { description, hashtags };
}

export function startMetadataGenerationWorker() {
  return new Worker<GenerationJobData>(
    "metadata-generation",
    async (job: Job<GenerationJobData>) => {
      const generation = await prisma.generation.findUniqueOrThrow({
        where: { id: job.data.generationId },
        include: { contentTemplate: true, video: true, schedule: true },
      });

      await publishProgress({
        generationId: generation.id,
        status: "GENERATING_METADATA",
        progress: 90,
        currentStep: "Generating titles, descriptions & hashtags",
      });

      const clips = await prisma.clip.findMany({
        where: { generationId: generation.id, status: "READY" },
        orderBy: { index: "asc" },
      });

      const ai = await getAIProvider();
      const sharedCache: { description?: string; hashtags?: string[] } = {};
      const template: ContentTemplate | null = generation.contentTemplate;

      for (const clip of clips) {
        try {
          const transcriptExcerpt = clip.reason ?? clip.title ?? "";
          const { description, hashtags } = await resolveDescriptionAndHashtags(
            ai,
            clip,
            transcriptExcerpt,
            generation.contentType,
            generation.batchTextMode,
            sharedCache,
          );

          const caption = assembleCaption({
            title: clip.title ?? "",
            description,
            hashtags,
            bioTemplate: template?.bio,
            variables: {
              title: clip.title ?? "",
              description,
              hashtags,
              clip_number: clip.index,
              category: clip.category ?? undefined,
              score: clip.score ?? undefined,
              duration: clip.durationSec ?? undefined,
              channel: generation.video.channel ?? undefined,
              cta: template?.cta ?? undefined,
            },
          });

          await prisma.clip.update({
            where: { id: clip.id },
            data: { description, hashtags: template?.hashtags.length ? [...hashtags, ...template.hashtags] : hashtags },
          });

          if (generation.textVariantCount > 1) {
            const variants = await ai.generateVariants({
              text: caption,
              count: generation.textVariantCount,
            });
            await prisma.textVariant.createMany({
              data: variants.map((v) => ({
                clipId: clip.id,
                label: v.label,
                description: v.text,
              })),
            });
          }
        } catch (err) {
          // Metadata failure shouldn't sink an already-rendered clip — it
          // just falls back to the AI title/reason it already has from
          // highlight detection.
          await prisma.auditLog.create({
            data: {
              action: "metadata_generation_failed",
              metadata: {
                clipId: clip.id,
                error: err instanceof Error ? err.message : String(err),
              },
            },
          }).catch(() => undefined);
        }
      }

      const finalClips = await prisma.clip.findMany({
        where: { generationId: generation.id },
        select: { status: true },
      });
      const successCount = finalClips.filter((c) => c.status === "READY").length;
      const failedCount = finalClips.filter((c) => c.status === "FAILED").length;
      const finalStatus =
        successCount === 0
          ? "FAILED"
          : failedCount > 0
            ? "COMPLETED_WITH_WARNINGS"
            : "COMPLETED";

      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: finalStatus, progress: 100, currentStep: "Completed" },
      });

      await publishProgress({
        generationId: generation.id,
        status: finalStatus,
        progress: 100,
        currentStep:
          finalStatus === "COMPLETED_WITH_WARNINGS"
            ? `Completed with warnings: ${successCount} successful, ${failedCount} failed`
            : "Completed",
        clipsCompleted: successCount + failedCount,
        clipsTotal: finalClips.length,
      });

      if (generation.autoPostEnabled && generation.schedule) {
        await scheduleAutoPost(generation.id);
      }

      await cleanupWorkDir(generation.id);

      return { successCount, failedCount };
    },
    { connection: redis, concurrency: 2 },
  );
}

async function scheduleAutoPost(generationId: string): Promise<void> {
  const generation = await prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    include: {
      schedule: true,
      clips: { where: { status: "READY" }, orderBy: { index: "asc" } },
      user: { include: { tiktokAccounts: { where: { status: "connected" } } } },
    },
  });
  const account = generation.user.tiktokAccounts[0];
  if (!account || !generation.schedule) return;

  const slots = computeScheduleSlots({
    startAt: generation.schedule.startAt,
    intervalMin: generation.schedule.intervalMin,
    timezone: generation.schedule.timezone,
    count: generation.clips.length,
  });

  for (let i = 0; i < generation.clips.length; i++) {
    const clip = generation.clips[i]!;
    const scheduledFor = slots[i]!;
    const publishJob = await prisma.publishJob.create({
      data: {
        clipId: clip.id,
        tiktokAccountId: account.id,
        caption: [clip.title, clip.description].filter(Boolean).join("\n\n"),
        scheduledFor,
        status: "WAITING",
      },
    });

    await tiktokUploadQueue.add(
      "upload",
      { publishJobId: publishJob.id },
      { delay: Math.max(0, scheduledFor.getTime() - Date.now()) },
    );
  }
}
