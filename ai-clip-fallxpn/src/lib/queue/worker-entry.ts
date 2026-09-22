import "dotenv/config";
import { startVideoAnalysisWorker } from "@/lib/queue/workers/video-analysis.worker";
import { startTranscriptionWorker } from "@/lib/queue/workers/transcription.worker";
import { startHighlightDetectionWorker } from "@/lib/queue/workers/highlight-detection.worker";
import { startClipGenerationWorker } from "@/lib/queue/workers/clip-generation.worker";
import { startAutoEditWorker } from "@/lib/queue/workers/auto-edit.worker";
import { startSubtitleGenerationWorker } from "@/lib/queue/workers/subtitle-generation.worker";
import { startRenderVideoWorker } from "@/lib/queue/workers/render-video.worker";
import { startMetadataGenerationWorker } from "@/lib/queue/workers/metadata-generation.worker";
import { startZipGenerationWorker } from "@/lib/queue/workers/zip-generation.worker";
import { startTiktokUploadWorker } from "@/lib/queue/workers/tiktok-upload.worker";
import { startTiktokPublishWorker } from "@/lib/queue/workers/tiktok-publish.worker";
import { startTiktokStatusWorker } from "@/lib/queue/workers/tiktok-status.worker";

/**
 * Runs all 12 pipeline stages as BullMQ workers inside ONE long-lived Node
 * process. Start it with `npm run worker` (or `worker:dev` for hot reload).
 *
 * This must run as its own process/container — NEVER inside a Next.js
 * serverless function (spec section 50) — because FFmpeg and Whisper jobs
 * are long-running and CPU/memory heavy, and this process needs a real
 * local filesystem for its scratch directory (see `work-dir.ts`).
 *
 * Deployment note: as written, every stage shares one local WORK_DIR, which
 * means all 12 workers must run on the SAME machine/container so later
 * stages can see files earlier stages wrote (see the comment in
 * `render-video.worker.ts`). To scale horizontally across multiple worker
 * machines instead, either mount a shared network filesystem at
 * WORKER_TMP_DIR, or change each stage to round-trip its intermediate
 * output through the StorageDriver (S3/R2/MinIO) instead of local disk.
 */
async function main() {
  const workers = [
    startVideoAnalysisWorker(),
    startTranscriptionWorker(),
    startHighlightDetectionWorker(),
    startClipGenerationWorker(),
    startAutoEditWorker(),
    startSubtitleGenerationWorker(),
    startRenderVideoWorker(),
    startMetadataGenerationWorker(),
    startZipGenerationWorker(),
    startTiktokUploadWorker(),
    startTiktokPublishWorker(),
    startTiktokStatusWorker(),
  ];

  for (const worker of workers) {
    worker.on("failed", (job, err) => {
      console.error(`[${worker.name}] job ${job?.id} failed:`, err.message);
    });
  }

  console.log(`AI ClipFlow worker started — ${workers.length} queues active.`);

  const shutdown = async () => {
    console.log("Shutting down workers...");
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Worker process failed to start:", err);
  process.exit(1);
});
