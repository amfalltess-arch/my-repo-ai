import { Worker, type Job } from "bullmq";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { getValidAccessToken } from "@/lib/tiktok/token-manager";
import { fetchPublishStatus } from "@/lib/tiktok/content-posting";
import { tiktokStatusQueue, type PublishJobData } from "@/lib/queue/queues";

const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_ATTEMPTS = 40; // ~10 minutes total

export function startTiktokStatusWorker() {
  return new Worker<PublishJobData>(
    "tiktok-status",
    async (job: Job<PublishJobData>) => {
      const publishJob = await prisma.publishJob.findUniqueOrThrow({
        where: { id: job.data.publishJobId },
      });
      if (!publishJob.publishId) return { status: "no publish_id yet" };

      const accessToken = await getValidAccessToken(publishJob.tiktokAccountId);
      const result = await fetchPublishStatus({
        accessToken,
        publishId: publishJob.publishId,
      });

      if (result.status === "PUBLISH_COMPLETE") {
        await prisma.publishJob.update({
          where: { id: publishJob.id },
          data: {
            status: "PUBLISHED",
            publishedAt: new Date(),
            tiktokPostId: result.publiclyAvailablePostId?.[0],
          },
        });
        return { status: "published" };
      }

      if (result.status === "FAILED") {
        await prisma.publishJob.update({
          where: { id: publishJob.id },
          data: { status: "FAILED", lastError: result.failReason ?? "TikTok reported a failure." },
        });
        return { status: "failed" };
      }

      // Still processing — re-enqueue ourselves rather than blocking this
      // worker slot with a long sleep, up to a sane attempt ceiling.
      if ((job.attemptsMade ?? 0) < MAX_POLL_ATTEMPTS) {
        await tiktokStatusQueue.add("poll", job.data, { delay: POLL_INTERVAL_MS });
        return { status: result.status, requeued: true };
      }

      await prisma.publishJob.update({
        where: { id: publishJob.id },
        data: {
          status: "RETRYING",
          lastError: `Still processing on TikTok's side after ${MAX_POLL_ATTEMPTS} checks; will retry.`,
        },
      });
      return { status: "gave up polling" };
    },
    { connection: redis, concurrency: 5 },
  );
}
