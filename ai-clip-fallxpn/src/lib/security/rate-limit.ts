import { redis, assertRedisConfigured } from "@/lib/redis";

/**
 * Fixed-window rate limiter backed by Redis (INCR + EXPIRE). Good enough for
 * login attempts and generation-creation throttling; not meant to be a
 * perfectly smooth sliding window, just cheap and race-safe via INCR.
 */
export async function checkRateLimit(params: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
  const { key, limit, windowSeconds } = params;
  assertRedisConfigured();
  const redisKey = `ratelimit:${key}`;

  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }
  const ttl = await redis.ttl(redisKey);
  const resetInSeconds = ttl > 0 ? ttl : windowSeconds;

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetInSeconds,
  };
}

/** Convenience wrapper that throws a typed error when the limit is hit. */
export class RateLimitExceededError extends Error {
  constructor(public resetInSeconds: number) {
    super("Rate limit exceeded");
    this.name = "RateLimitExceededError";
  }
}

export async function enforceRateLimit(params: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<void> {
  const result = await checkRateLimit(params);
  if (!result.allowed) {
    throw new RateLimitExceededError(result.resetInSeconds);
  }
}
