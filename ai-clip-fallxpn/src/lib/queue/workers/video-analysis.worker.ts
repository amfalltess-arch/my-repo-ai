import { Worker, UnrecoverableError, type Job } from "bullmq";
import path from "node:path";
import fs from "node:fs/promises";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { probeMedia } from "@/lib/ffmpeg/probe";
import { downloadYoutubeVideo } from "@/lib/youtube/youtube";
import { getStorageDriver, generateStorageKey } from "@/lib/storage/storage";
import { publishProgress } from "@/lib/queue/progress";
import { transcriptionQueue, type GenerationJobData } from "@/lib/queue/queues";
import { workDirFor } from "@/lib/queue/work-dir";

export function startVideoAnalysisWorker() {
  return new Worker<GenerationJobData>(
    "video-analysis",
    async (job: Job<GenerationJobData>) => {
      const generation = await prisma.generation.findUniqueOrThrow({
        where: { id: job.data.generationId },
        include: { video: true },
      });

      await publishProgress({
        generationId: generation.id,
        status: "ANALYZING",
        progress: 5,
        currentStep: "Analyzing video",
      });

      const dir = await workDirFor(generation.id);
      const sourcePath = path.join(dir, "source.mp4");

      if (generation.video.sourceType === "YOUTUBE") {
        if (!generation.video.sourceUrl) {
          throw new Error("YouTube video is missing its source URL.");
        }
        await downloadYoutubeVideo({
          url: generation.video.sourceUrl,
          outputPath: sourcePath,
          maxDurationSec: Number(process.env.MAX_VIDEO_DURATION_SEC ?? 14400),
        });
      } else {
        // UPLOAD / IMPORTED: pull the already-stored source asset down to
        // local disk so ffmpeg/whisper (which need a real file path) can
        // read it, regardless of which storage backend holds it.
        const asset = await prisma.videoAsset.findFirst({
          where: { videoId: generation.video.id, kind: "source" },
        });
        if (!asset) throw new Error("No source asset found for this video.");
        const storage = await getStorageDriver();
        const buffer = await storage.get(asset.storageKey);
        await fs.writeFile(sourcePath, buffer);
      }

      const probe = await probeMedia(sourcePath);

      // Uploads on Vercel go straight to object storage and are never probed by
      // the web tier, so the per-user duration limit is enforced here instead.
      const owner = await prisma.user.findUnique({
        where: { id: generation.video.userId },
        select: { role: true, maxVideoDurationSec: true },
      });
      const maxDuration = owner?.role === "ADMIN" ? null : owner?.maxVideoDurationSec;
      if (maxDuration && probe.durationSec > maxDuration) {
        const reason =
          `Video is ${Math.round(probe.durationSec / 60)} min, which exceeds your ` +
          `${Math.round(maxDuration / 60)} min limit.`;
        await prisma.video.update({
          where: { id: generation.video.id },
          data: { status: "FAILED", failureReason: reason },
        });
        await publishProgress({
          generationId: generation.id,
          status: "FAILED",
          progress: 100,
          currentStep: reason,
        });
        throw new UnrecoverableError(reason);
      }

      await prisma.video.update({
        where: { id: generation.video.id },
        data: {
          status: "READY",
          durationSec: Math.round(probe.durationSec),
          resolution: `${probe.width}x${probe.height}`,
        },
      });

      // Persist the local source path for downstream workers in this same
      // generation run. Storing it on the job's return value (rather than
      // re-deriving it) keeps every later stage pointed at the exact same
      // file without re-downloading.
      await publishProgress({
        generationId: generation.id,
        status: "TRANSCRIBING",
        progress: 10,
        currentStep: "Extracting audio & transcribing",
      });

      await transcriptionQueue.add("transcribe", {
        generationId: generation.id,
      });

      return { sourcePath, probe };
    },
    { connection: redis, concurrency: 2 },
  );
}
