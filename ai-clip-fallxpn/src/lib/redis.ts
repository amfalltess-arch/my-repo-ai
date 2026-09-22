import IORedis, { type Redis } from "ioredis";
import { isServerless } from "@/lib/runtime";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
  redisSub: Redis | undefined;
};

/**
 * Throws a clear error when REDIS_URL is missing. Called right before Redis is
 * actually used (not at import time), so `next build` on Vercel can import
 * every route module without needing a live Redis instance.
 */
export function assertRedisConfigured(): void {
  if (!process.env.REDIS_URL) {
    throw new Error(
      "REDIS_URL is not set. AI ClipFlow requires Redis for job queues, " +
        "rate limiting, and realtime progress pub/sub.",
    );
  }
}

function createConnection(): Redis {
  return new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
    // Do not connect on import: the connection opens on the first command.
    // This keeps `next build` and cold starts from hanging on Redis.
    lazyConnect: true,
    // BullMQ Workers require `null` (they manage retries themselves). The web
    // tier on Vercel/Netlify only enqueues jobs, so fail fast there instead of letting
    // a request hang until the function times out.
    maxRetriesPerRequest: isServerless() ? 2 : null,
    connectTimeout: 10_000,
  });
}

/** General-purpose connection: rate limiting, pub/sub publish, BullMQ queues. */
export const redis: Redis = globalForRedis.redis ?? createConnection();

/**
 * A dedicated connection for pub/sub *subscriptions*. Redis puts a connection
 * that calls SUBSCRIBE into a special mode where it can no longer run normal
 * commands, so this must never be the same client used for GET/SET/etc.
 */
export const redisSub: Redis = globalForRedis.redisSub ?? createConnection();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
  globalForRedis.redisSub = redisSub;
}
