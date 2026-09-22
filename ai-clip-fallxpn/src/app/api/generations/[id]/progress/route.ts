import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { sseLifetimeMs } from "@/lib/runtime";
import { subscribeToProgress, type ProgressEvent } from "@/lib/queue/progress";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Serverless hosts close a streaming response when the function hits its time
// limit (Vercel: `maxDuration` below; Netlify: 10 s by default). The stream ends
// itself earlier (see `sseLifetimeMs`) and `EventSource` reconnects automatically (the first
// message of every connection is the current state, so nothing is lost).
export const maxDuration = 300;

/**
 * Spec section 39: "Gunakan WebSocket/SSE" for realtime progress. SSE is
 * simpler than a WebSocket here since progress only flows server->client;
 * `EventSource` on the client reconnects automatically if the connection
 * drops, which is most of what a hand-rolled WebSocket would need anyway.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;

  const generation = await prisma.generation.findFirst({
    where: { id, userId: user.id },
  });
  if (!generation) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: ProgressEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      // Send the current state immediately so a client that connects after
      // the fact isn't stuck waiting for the next state change.
      send({
        generationId: generation.id,
        status: generation.status,
        progress: generation.progress,
        currentStep: generation.currentStep ?? "",
      });

      unsubscribe = subscribeToProgress(id, send);

      let closed = false;
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          close();
        }
      }, 15000);

      function close() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }

      const lifetime = setTimeout(close, sseLifetimeMs());
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
