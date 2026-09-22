import { Worker, type Job } from "bullmq";
import path from "node:path";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { cutSegment } from "@/lib/ffmpeg/render";
import { autoEditQueue, type ClipJobData } from "@/lib/queue/queues";
import { workDirFor, clipWorkDirFor } from "@/lib/queue/work-dir";
import { markClipFailed } from "@/lib/queue/workers/clip-failure";

export function startClipGenerationWorker() {
  return new Worker<ClipJobData>(
    "clip-generation",
    async (job: Job<ClipJobData>) => {
      const clip = await prisma.clip.findUniqueOrThrow({
        where: { id: job.data.clipId },
      });

      try {
        await prisma.clip.update({
          where: { id: clip.id },
          data: { status: "CUTTING" },
        });

        const genDir = await workDirFor(job.data.generationId);
        const clipDir = await clipWorkDirFor(job.data.generationId, clip.id);
        const sourcePath = path.join(genDir, "source.mp4");
        const cutPath = path.join(clipDir, "cut.mp4");

        await cutSegment({
          sourcePath,
          outputPath: cutPath,
          startSec: clip.startSec,
          endSec: clip.endSec,
        });

        await autoEditQueue.add("edit", job.data);
        return { cutPath };
      } catch (err) {
        await markClipFailed(clip.id, job.data.generationId, err);
        throw err;
      }
    },
    { connection: redis, concurrency: 4 },
  );
}
