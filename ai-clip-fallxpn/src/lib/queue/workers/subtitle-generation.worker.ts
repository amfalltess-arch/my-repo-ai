import { Worker, type Job } from "bullmq";
import fs from "node:fs/promises";
import path from "node:path";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import type { TranscriptSegment } from "@/lib/ai/types";
import {
  buildAssSubtitle,
  buildSrt,
  buildVtt,
  type SubtitleSettings,
} from "@/lib/ffmpeg/subtitle";
import { remapTranscriptSegments, type TimeRange } from "@/lib/ffmpeg/silence-removal";
import { ASPECT_RATIO_DIMENSIONS } from "@/lib/queue/workers/constants";
import { getStorageDriver, generateStorageKey } from "@/lib/storage/storage";
import { renderVideoQueue, type ClipJobData } from "@/lib/queue/queues";
import { clipWorkDirFor } from "@/lib/queue/work-dir";
import { markClipFailed } from "@/lib/queue/workers/clip-failure";

/** Slices the full-video transcript to one clip's [start, end) window and re-zeroes timestamps. */
function sliceTranscript(
  transcript: TranscriptSegment[],
  clipStart: number,
  clipEnd: number,
): TranscriptSegment[] {
  return transcript
    .filter((s) => s.end > clipStart && s.start < clipEnd)
    .map((s) => ({
      start: Math.max(0, s.start - clipStart),
      end: Math.min(clipEnd - clipStart, s.end - clipStart),
      text: s.text,
      words: s.words
        ?.filter((w) => w.end > clipStart && w.start < clipEnd)
        .map((w) => ({
          word: w.word,
          start: Math.max(0, w.start - clipStart),
          end: Math.min(clipEnd - clipStart, w.end - clipStart),
        })),
    }));
}

export function startSubtitleGenerationWorker() {
  return new Worker<ClipJobData>(
    "subtitle-generation",
    async (job: Job<ClipJobData>) => {
      const [clip, generation] = await Promise.all([
        prisma.clip.findUniqueOrThrow({ where: { id: job.data.clipId } }),
        prisma.generation.findUniqueOrThrow({
          where: { id: job.data.generationId },
          include: { video: true },
        }),
      ]);

      try {
        await prisma.clip.update({
          where: { id: clip.id },
          data: { status: "SUBTITLING" },
        });

        if (!generation.subtitleEnabled) {
          await renderVideoQueue.add("render", job.data);
          return { skipped: true };
        }

        const analysis = await prisma.aIAnalysis.findFirst({
          where: { videoId: generation.videoId },
          orderBy: { createdAt: "desc" },
        });
        const fullTranscript =
          (analysis?.transcript as unknown as TranscriptSegment[]) ?? [];

        let clipTranscript = sliceTranscript(
          fullTranscript,
          clip.startSec,
          clip.endSec,
        );

        const autoEditJob = await prisma.processingJob.findFirst({
          where: { clipId: clip.id, type: "AUTO_EDIT", status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
        });
        const keepRanges = (
          autoEditJob?.result as { keepRanges: TimeRange[] | null } | null
        )?.keepRanges;
        if (keepRanges) {
          clipTranscript = remapTranscriptSegments(clipTranscript, keepRanges);
        }

        const [width, height] = ASPECT_RATIO_DIMENSIONS[generation.aspectRatio];
        const settings: SubtitleSettings = {
          style: generation.subtitleStyle,
          wordsPerLine: 3,
        };

        const ass = buildAssSubtitle(clipTranscript, settings, width, height);
        const srt = buildSrt(clipTranscript);
        const vtt = buildVtt(clipTranscript);

        const clipDir = await clipWorkDirFor(job.data.generationId, clip.id);
        const assPath = path.join(clipDir, "subtitle.ass");
        await fs.writeFile(assPath, ass, "utf8");

        const storage = await getStorageDriver();
        const srtKey = generateStorageKey(`captions/${clip.id}`, "srt");
        const vttKey = generateStorageKey(`captions/${clip.id}`, "vtt");
        await storage.put(srtKey, Buffer.from(srt, "utf8"), "text/plain");
        await storage.put(vttKey, Buffer.from(vtt, "utf8"), "text/vtt");

        await prisma.caption.createMany({
          data: [
            { clipId: clip.id, format: "ass", content: { ass } },
            { clipId: clip.id, format: "srt", storageKey: srtKey },
            { clipId: clip.id, format: "vtt", storageKey: vttKey },
          ],
        });

        await renderVideoQueue.add("render", job.data);
        return { assPath };
      } catch (err) {
        await markClipFailed(clip.id, job.data.generationId, err);
        throw err;
      }
    },
    { connection: redis, concurrency: 4 },
  );
}
