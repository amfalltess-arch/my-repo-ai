import { redis, redisSub, assertRedisConfigured } from "@/lib/redis";
import { prisma } from "@/lib/db";
import type { GenerationStatus } from "@prisma/client";

export interface ProgressEvent {
  generationId: string;
  status: GenerationStatus;
  progress: number;
  currentStep: string;
  clipsCompleted?: number;
  clipsTotal?: number;
}

function channelFor(generationId: string): string {
  return `generation:${generationId}:progress`;
}

/**
 * Called by workers after every meaningful state change. Persists to
 * Postgres (source of truth, read on page load / reconnect) AND publishes
 * to Redis (pushed live to any open SSE connection) — the same pattern the
 * spec's WebSocket/SSE requirement (section 39) describes.
 */
export async function publishProgress(event: ProgressEvent): Promise<void> {
  await prisma.generation.update({
    where: { id: event.generationId },
    data: {
      status: event.status,
      progress: event.progress,
      currentStep: event.currentStep,
    },
  });
  assertRedisConfigured();
  await redis.publish(channelFor(event.generationId), JSON.stringify(event));
}

/** Used by the SSE route handler; `onEvent` fires for every published update until `unsubscribe()` is called. */
export function subscribeToProgress(
  generationId: string,
  onEvent: (event: ProgressEvent) => void,
): () => void {
  assertRedisConfigured();
  const channel = channelFor(generationId);
  const handler = (chan: string, message: string) => {
    if (chan !== channel) return;
    try {
      onEvent(JSON.parse(message) as ProgressEvent);
    } catch {
      // malformed message — ignore rather than crashing the SSE stream
    }
  };

  redisSub.subscribe(channel).catch(() => undefined);
  redisSub.on("message", handler);

  return () => {
    redisSub.off("message", handler);
    redisSub.unsubscribe(channel).catch(() => undefined);
  };
}
