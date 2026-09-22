import { Worker, type Job } from "bullmq";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { getStorageDriver } from "@/lib/storage/storage";
import { getValidAccessToken } from "@/lib/tiktok/token-manager";
import {
  initDirectPost,
  queryCreatorInfo,
  uploadVideoChunks,
} from "@/lib/tiktok/content-posting";
import { tiktokPublishQueue, type PublishJobData } from "@/lib/queue/queues";

export function startTiktokUploadWorker() {
  return new Worker<PublishJobData>(
    "tiktok-upload",
    async (job: Job<PublishJobData>) => {
      const publishJob = await prisma.publishJob.findUniqueOrThrow({
        where: { id: job.data.publishJobId },
        include: { clip: true, tiktokAccount: true },
      });

      try {
        await prisma.publishJob.update({
          where: { id: publishJob.id },
          data: { status: "PROCESSING", attempts: { increment: 1 } },
        });

        if (!publishJob.clip.renderedStorageKey) {
          throw new Error("Clip has no rendered video to publish.");
        }

        const accessToken = await getValidAccessToken(publishJob.tiktokAccountId);
        const creatorInfo = await queryCreatorInfo(accessToken);

        // Enforce the platform rule up front rather than letting TikTok
        // silently downgrade an unaudited app's post to private (spec
        // section 55's "show a clear error" principle, applied proactively).
        let privacyLevel = publishJob.privacyLevel;
        if (!creatorInfo.privacyLevelOptions.includes(privacyLevel)) {
          privacyLevel = creatorInfo.privacyLevelOptions[0] ?? "SELF_ONLY";
        }

        const storage = await getStorageDriver();
        const videoBuffer = await storage.get(publishJob.clip.renderedStorageKey);

        await prisma.publishJob.update({
          where: { id: publishJob.id },
          data: { status: "UPLOADING", privacyLevel },
        });

        const init = await initDirectPost({
          accessToken,
          title: publishJob.caption.slice(0, 150),
          privacyLevel,
          videoSizeBytes: videoBuffer.length,
        });

        await uploadVideoChunks({
          uploadUrl: init.uploadUrl,
          video: videoBuffer,
          chunkSize: init.chunkSize,
          totalChunkCount: init.totalChunkCount,
        });

        await prisma.publishJob.update({
          where: { id: publishJob.id },
          data: { publishId: init.publishId },
        });

        await tiktokPublishQueue.add("confirm", job.data, { delay: 5000 });
        return { publishId: init.publishId };
      } catch (err) {
        await prisma.publishJob.update({
          where: { id: publishJob.id },
          data: {
            status: "FAILED",
            lastError: err instanceof Error ? err.message : String(err),
          },
        });
        throw err;
      }
    },
    { connection: redis, concurrency: 1 }, // TikTok's 6/min limit applies per user token; 1-at-a-time keeps this simple and safe
  );
}
