import { Worker, type Job } from "bullmq";
import path from "node:path";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { runFfmpeg } from "@/lib/ffmpeg/ffmpeg";
import { transcribeAudio } from "@/lib/transcription/whisper";
import { publishProgress } from "@/lib/queue/progress";
import { highlightDetectionQueue, type GenerationJobData } from "@/lib/queue/queues";
import { workDirFor } from "@/lib/queue/work-dir";

export function startTranscriptionWorker() {
  return new Worker<GenerationJobData>(
    "transcription",
    async (job: Job<GenerationJobData>) => {
      const generation = await prisma.generation.findUniqueOrThrow({
        where: { id: job.data.generationId },
        include: { video: true },
      });

      const dir = await workDirFor(generation.id);
      const sourcePath = path.join(dir, "source.mp4");
      const audioPath = path.join(dir, "audio.wav");

      // 16kHz mono WAV is what most Whisper implementations expect and
      // keeps the upload/processing payload small.
      await runFfmpeg([
        "-i",
        sourcePath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        audioPath,
      ]);

      const transcript = await transcribeAudio({ filePath: audioPath });

      await prisma.aIAnalysis.create({
        data: {
          videoId: generation.video.id,
          provider: "GEMINI", // updated to the real provider used once analyzeTranscript runs next stage
          transcript: transcript as unknown as object,
          candidates: [],
        },
      });

      await publishProgress({
        generationId: generation.id,
        status: "FINDING_HIGHLIGHTS",
        progress: 25,
        currentStep: "Finding best moments",
      });

      await highlightDetectionQueue.add("detect", {
        generationId: generation.id,
      });

      return { segmentCount: transcript.length };
    },
    { connection: redis, concurrency: 2 },
  );
}
