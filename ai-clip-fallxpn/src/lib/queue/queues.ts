import { Queue, type QueueOptions } from "bullmq";
import { redis, assertRedisConfigured } from "@/lib/redis";

/**
 * Processing pipeline (spec section 35):
 *   video-analysis -> transcription -> highlight-detection -> clip-generation
 *   -> auto-edit -> subtitle-generation -> render-video -> metadata-generation
 *   -> zip-generation
 *   tiktok-upload -> tiktok-publish -> tiktok-status  (separate chain, triggered per clip)
 *
 * Each stage is its own BullMQ queue so it can be scaled, retried, and
 * monitored independently (spec section 29's Admin > Queue page reads these
 * queues' counts in Phase 2).
 */

type JobDefaults = NonNullable<QueueOptions["defaultJobOptions"]>;

const defaultJobOptions: JobDefaults = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};

/**
 * Queues are created lazily, on first use. BullMQ opens a Redis connection as
 * soon as a `Queue` is constructed, so building them at import time would make
 * `next build` (and every serverless cold start) try to reach Redis even for
 * routes that never enqueue anything. The Proxy keeps the exported names and
 * call sites (`videoAnalysisQueue.add(...)`) unchanged.
 */
function lazyQueue(name: string, jobOptions: JobDefaults): Queue {
  let instance: Queue | undefined;
  const get = (): Queue => {
    if (!instance) {
      assertRedisConfigured();
      instance = new Queue(name, { connection: redis, defaultJobOptions: jobOptions });
    }
    return instance;
  };
  return new Proxy({} as Queue, {
    get(_target, prop) {
      const q = get();
      const value = Reflect.get(q, prop, q) as unknown;
      return typeof value === "function" ? value.bind(q) : value;
    },
  });
}

export const videoAnalysisQueue = lazyQueue("video-analysis", defaultJobOptions);
export const transcriptionQueue = lazyQueue("transcription", defaultJobOptions);
export const highlightDetectionQueue = lazyQueue("highlight-detection", defaultJobOptions);
export const clipGenerationQueue = lazyQueue("clip-generation", defaultJobOptions);
export const autoEditQueue = lazyQueue("auto-edit", defaultJobOptions);
export const subtitleGenerationQueue = lazyQueue("subtitle-generation", defaultJobOptions);
export const renderVideoQueue = lazyQueue("render-video", defaultJobOptions);
export const metadataGenerationQueue = lazyQueue("metadata-generation", defaultJobOptions);
export const zipGenerationQueue = lazyQueue("zip-generation", { ...defaultJobOptions, attempts: 2 });

export const tiktokUploadQueue = lazyQueue("tiktok-upload", defaultJobOptions);
export const tiktokPublishQueue = lazyQueue("tiktok-publish", defaultJobOptions);
export const tiktokStatusQueue = lazyQueue("tiktok-status", { ...defaultJobOptions, attempts: 10 });

export interface GenerationJobData {
  generationId: string;
}
export interface ClipJobData {
  generationId: string;
  clipId: string;
}
export interface PublishJobData {
  publishJobId: string;
}
