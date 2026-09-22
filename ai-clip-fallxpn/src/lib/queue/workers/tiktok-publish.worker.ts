import { Worker, type Job } from "bullmq";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { tiktokStatusQueue, type PublishJobData } from "@/lib/queue/queues";

/**
 * TikTok's Direct Post API (`video.publish` scope) publishes as part of the
 * same `init` + chunk-upload call handled in `tiktok-upload.worker.ts` —
 * there is no separate "now actually publish it" request to make. This
 * stage exists to match the spec's named pipeline (section 35) and as the
 * natural place to plug in the two-step "upload as draft, publish later"
 * flow (TikTok's `video.upload`/inbox scope) if that's ever needed
 * alongside Direct Post. Today it just marks the handoff to TikTok's
 * processing pipeline and starts the status poller.
 */
export function startTiktokPublishWorker() {
  return new Worker<PublishJobData>(
    "tiktok-publish",
    async (job: Job<PublishJobData>) => {
      const publishJob = await prisma.publishJob.findUniqueOrThrow({
        where: { id: job.data.publishJobId },
      });

      if (!publishJob.publishId) {
        throw new Error("Cannot confirm publish: no TikTok publish_id was recorded.");
      }

      await tiktokStatusQueue.add("poll", job.data, { delay: 5000 });
      return { publishId: publishJob.publishId };
    },
    { connection: redis, concurrency: 4 },
  );
}
