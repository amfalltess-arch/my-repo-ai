import { prisma } from "@/lib/db";
import { publishProgress } from "@/lib/queue/progress";

/**
 * Spec section 40: "Jika clip tertentu gagal: jangan menggagalkan seluruh
 * batch." Every worker stage catches its own errors, calls this, and
 * re-throws so BullMQ still records/retries the job — but the *generation*
 * as a whole is only ever marked FAILED if literally every clip failed.
 */
export async function markClipFailed(
  clipId: string,
  generationId: string,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await prisma.clip.update({
    where: { id: clipId },
    data: { status: "FAILED", failureReason: message.slice(0, 1000) },
  });
  await maybeFinalizeGeneration(generationId);
}

/**
 * Call after any clip reaches a terminal state (READY or FAILED). Once
 * every clip for the generation is terminal, rolls the generation itself
 * to COMPLETED / COMPLETED_WITH_WARNINGS / FAILED and reports the final
 * "N successful, M failed" tally used by the results page.
 */
export async function maybeFinalizeGeneration(
  generationId: string,
): Promise<{ done: boolean; successCount: number; failedCount: number } | null> {
  const clips = await prisma.clip.findMany({
    where: { generationId },
    select: { status: true },
  });
  const terminal = clips.filter((c) => c.status === "READY" || c.status === "FAILED");
  if (terminal.length < clips.length) {
    return { done: false, successCount: 0, failedCount: 0 };
  }

  const successCount = clips.filter((c) => c.status === "READY").length;
  const failedCount = clips.filter((c) => c.status === "FAILED").length;

  const status =
    successCount === 0
      ? "FAILED"
      : failedCount > 0
        ? "COMPLETED_WITH_WARNINGS"
        : "COMPLETED";

  const generation = await prisma.generation.findUnique({
    where: { id: generationId },
  });
  // Metadata-generation already moved status past GENERATING_CLIPS in the
  // happy path; only stamp a terminal status here if rendering is what
  // just finished (this function is also called mid-pipeline after each
  // individual clip render, when the generation is deliberately still "in
  // progress" from the DB's point of view).
  if (generation && generation.status !== "COMPLETED" && generation.status !== "COMPLETED_WITH_WARNINGS") {
    await publishProgress({
      generationId,
      status,
      progress: status === "FAILED" ? 100 : generation.progress,
      currentStep:
        status === "FAILED"
          ? "All clips failed"
          : generation.currentStep ?? "Rendering",
      clipsCompleted: successCount + failedCount,
      clipsTotal: clips.length,
    });
  }

  return { done: true, successCount, failedCount };
}
