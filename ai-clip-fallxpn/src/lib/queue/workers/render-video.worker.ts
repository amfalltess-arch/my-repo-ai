import { Worker, type Job } from "bullmq";
import fs from "node:fs/promises";
import path from "node:path";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { burnSubtitles } from "@/lib/ffmpeg/render";
import { extractThumbnail } from "@/lib/ffmpeg/thumbnail";
import { probeMedia } from "@/lib/ffmpeg/probe";
import { getStorageDriver, generateStorageKey } from "@/lib/storage/storage";
import { publishProgress } from "@/lib/queue/progress";
import { metadataGenerationQueue, type ClipJobData } from "@/lib/queue/queues";
import { clipWorkDirFor } from "@/lib/queue/work-dir";
import { markClipFailed, maybeFinalizeGeneration } from "@/lib/queue/workers/clip-failure";

export function startRenderVideoWorker() {
  return new Worker<ClipJobData>(
    "render-video",
    async (job: Job<ClipJobData>) => {
      const clip = await prisma.clip.findUniqueOrThrow({
        where: { id: job.data.clipId },
      });

      try {
        await prisma.clip.update({
          where: { id: clip.id },
          data: { status: "RENDERING" },
        });

        const clipDir = await clipWorkDirFor(job.data.generationId, clip.id);
        const editedPath = path.join(clipDir, "edited.mp4");
        const finalPath = path.join(clipDir, "final.mp4");
        const thumbPath = path.join(clipDir, "thumb.jpg");
        const assPath = path.join(clipDir, "subtitle.ass");

        const hasSubtitle = await fs
          .access(assPath)
          .then(() => true)
          .catch(() => false);

        if (hasSubtitle) {
          await burnSubtitles({
            inputPath: editedPath,
            assPath,
            outputPath: finalPath,
          });
        } else {
          await fs.copyFile(editedPath, finalPath);
        }

        const probe = await probeMedia(finalPath);
        await extractThumbnail({
          inputPath: finalPath,
          outputPath: thumbPath,
          atSec: Math.min(1, probe.durationSec / 3),
        });

        const storage = await getStorageDriver();
        const videoKey = generateStorageKey(`clips/${job.data.generationId}`, "mp4");
        const thumbKey = generateStorageKey(`thumbnails/${job.data.generationId}`, "jpg");
        await storage.put(videoKey, await fs.readFile(finalPath), "video/mp4");
        await storage.put(thumbKey, await fs.readFile(thumbPath), "image/jpeg");

        await prisma.clip.update({
          where: { id: clip.id },
          data: {
            status: "READY",
            renderedStorageKey: videoKey,
            thumbnailStorageKey: thumbKey,
            durationSec: probe.durationSec,
          },
        });

        const finalization = await maybeFinalizeGeneration(job.data.generationId);

        await publishProgress({
          generationId: job.data.generationId,
          status: "RENDERING",
          progress: 75,
          currentStep: "Rendering",
          clipsCompleted: finalization ? finalization.successCount + finalization.failedCount : undefined,
        });

        if (finalization?.done) {
          await metadataGenerationQueue.add("metadata", {
            generationId: job.data.generationId,
          });
        }

        return { videoKey, thumbKey };
      } catch (err) {
        await markClipFailed(clip.id, job.data.generationId, err);
        const finalization = await maybeFinalizeGeneration(job.data.generationId);
        if (finalization?.done) {
          await metadataGenerationQueue.add("metadata", {
            generationId: job.data.generationId,
          });
        }
        throw err;
      }
    },
    { connection: redis, concurrency: 3 },
  );
}
