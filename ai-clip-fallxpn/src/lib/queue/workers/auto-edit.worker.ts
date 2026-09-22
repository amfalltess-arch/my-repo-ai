import { Worker, type Job } from "bullmq";
import path from "node:path";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { probeMedia } from "@/lib/ffmpeg/probe";
import { applyAutoEdit } from "@/lib/ffmpeg/render";
import { ASPECT_RATIO_DIMENSIONS } from "@/lib/queue/workers/constants";
import { subtitleGenerationQueue, type ClipJobData } from "@/lib/queue/queues";
import { clipWorkDirFor } from "@/lib/queue/work-dir";
import { markClipFailed } from "@/lib/queue/workers/clip-failure";

export function startAutoEditWorker() {
  return new Worker<ClipJobData>(
    "auto-edit",
    async (job: Job<ClipJobData>) => {
      const [clip, generation] = await Promise.all([
        prisma.clip.findUniqueOrThrow({ where: { id: job.data.clipId } }),
        prisma.generation.findUniqueOrThrow({
          where: { id: job.data.generationId },
        }),
      ]);

      try {
        await prisma.clip.update({
          where: { id: clip.id },
          data: { status: "EDITING" },
        });

        const clipDir = await clipWorkDirFor(job.data.generationId, clip.id);
        const cutPath = path.join(clipDir, "cut.mp4");
        const editedPath = path.join(clipDir, "edited.mp4");

        const probe = await probeMedia(cutPath);
        const [outputWidth, outputHeight] =
          ASPECT_RATIO_DIMENSIONS[generation.aspectRatio];

        const result = await applyAutoEdit(cutPath, editedPath, {
          sourceWidth: probe.width,
          sourceHeight: probe.height,
          outputWidth,
          outputHeight,
          clipDurationSec: probe.durationSec,
          removeSilence: true,
          normalizeAudio: true,
          reduceNoise: true,
        });

        // Persisted so subtitle-generation (a separate job/worker, possibly
        // on a different process) can remap word timestamps if the
        // timeline shifted from jump-cutting silence.
        await prisma.processingJob.create({
          data: {
            generationId: job.data.generationId,
            clipId: clip.id,
            type: "AUTO_EDIT",
            status: "COMPLETED",
            progress: 100,
            result: {
              keepRanges: result.keepRanges?.map((range) => ({ ...range })) ?? null,
              newDurationSec: result.newDurationSec,
            },
          },
        });

        await subtitleGenerationQueue.add("subtitle", job.data);
        return result;
      } catch (err) {
        await markClipFailed(clip.id, job.data.generationId, err);
        throw err;
      }
    },
    { connection: redis, concurrency: 3 },
  );
}
