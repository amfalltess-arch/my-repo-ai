import { Worker, type Job } from "bullmq";
import path from "node:path";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { getAIProvider } from "@/lib/ai";
import type { TranscriptSegment } from "@/lib/ai/types";
import { detectHighlights } from "@/lib/highlight/highlight-service";
import { publishProgress } from "@/lib/queue/progress";
import { clipGenerationQueue, type GenerationJobData } from "@/lib/queue/queues";
import { workDirFor } from "@/lib/queue/work-dir";

export function startHighlightDetectionWorker() {
  return new Worker<GenerationJobData>(
    "highlight-detection",
    async (job: Job<GenerationJobData>) => {
      const generation = await prisma.generation.findUniqueOrThrow({
        where: { id: job.data.generationId },
        include: { video: true },
      });

      const analysis = await prisma.aIAnalysis.findFirst({
        where: { videoId: generation.video.id },
        orderBy: { createdAt: "desc" },
      });
      if (!analysis) throw new Error("No transcript found for this video.");

      const transcript = analysis.transcript as unknown as TranscriptSegment[];
      const ai = await getAIProvider();
      const dir = await workDirFor(generation.id);
      const sourcePath = path.join(dir, "source.mp4");

      const result = await detectHighlights({
        ai,
        sourcePath,
        transcript,
        contentType: generation.contentType,
        targetCount: generation.requestedCount,
        minDurationSec: generation.clipLengthMinSec,
        maxDurationSec: generation.clipLengthMaxSec,
        videoDurationSec: generation.video.durationSec ?? 0,
      });

      await prisma.aIAnalysis.update({
        where: { id: analysis.id },
        data: { candidates: result.selected as unknown as object },
      });

      if (result.selected.length === 0) {
        await prisma.generation.update({
          where: { id: generation.id },
          data: {
            status: "FAILED",
            actualCount: 0,
            failureReason:
              result.insufficientMaterialReason ??
              "No usable highlight moments were found in this video.",
          },
        });
        return { clipCount: 0 };
      }

      const clips = await prisma.$transaction(
        result.selected.map((candidate, index) =>
          prisma.clip.create({
            data: {
              generationId: generation.id,
              index: index + 1,
              startSec: candidate.start,
              endSec: candidate.end,
              title: candidate.title,
              score: candidate.score,
              category: candidate.category,
              reason: candidate.reason,
              status: "PENDING",
            },
          }),
        ),
      );

      await prisma.generation.update({
        where: { id: generation.id },
        data: {
          actualCount: clips.length,
          failureReason: result.insufficientMaterialReason,
          status: "GENERATING_CLIPS",
        },
      });

      await publishProgress({
        generationId: generation.id,
        status: "GENERATING_CLIPS",
        progress: 40,
        currentStep: `Creating ${clips.length} unique clips`,
        clipsTotal: clips.length,
        clipsCompleted: 0,
      });

      await clipGenerationQueue.addBulk(
        clips.map((clip) => ({
          name: "generate",
          data: { generationId: generation.id, clipId: clip.id },
        })),
      );

      return { clipCount: clips.length };
    },
    { connection: redis, concurrency: 2 },
  );
}
