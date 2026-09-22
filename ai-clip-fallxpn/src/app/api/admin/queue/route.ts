import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import {
  videoAnalysisQueue, transcriptionQueue, highlightDetectionQueue, clipGenerationQueue,
  autoEditQueue, subtitleGenerationQueue, renderVideoQueue, metadataGenerationQueue,
  zipGenerationQueue, tiktokUploadQueue, tiktokPublishQueue, tiktokStatusQueue,
} from "@/lib/queue/queues";

const QUEUES = [
  videoAnalysisQueue, transcriptionQueue, highlightDetectionQueue, clipGenerationQueue,
  autoEditQueue, subtitleGenerationQueue, renderVideoQueue, metadataGenerationQueue,
  zipGenerationQueue, tiktokUploadQueue, tiktokPublishQueue, tiktokStatusQueue,
];

export async function GET() {
  try {
    await requireAdmin();
    const counts = await Promise.all(
      QUEUES.map(async (q) => ({
        name: q.name,
        counts: await q.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
      })),
    );
    return NextResponse.json({ queues: counts });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("admin queue error:", err);
    return NextResponse.json(
      { error: "Could not read queue status. Is Redis reachable?" },
      { status: 500 },
    );
  }
}
