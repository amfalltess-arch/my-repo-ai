import { prisma } from "@/lib/db";
import { getAIProvider } from "@/lib/ai";
import type { HighlightCandidate } from "@/lib/ai/types";
import { timestampOverlapRatio } from "@/lib/highlight/duplicate-detection";
import { clipGenerationQueue } from "@/lib/queue/queues";

export type RegenerateField = "title" | "description" | "hashtags" | "caption" | "subtitle" | "highlight";

export interface RegeneratePreview {
  clipId: string;
  field: RegenerateField;
  currentValue: unknown;
  proposedValue: unknown;
}

/**
 * Spec section 47: "Jangan menghapus original sebelum user mengonfirmasi."
 * Title/description/hashtags/caption regeneration is synchronous and only
 * returned as a *preview* here — nothing is written to the database until
 * `applyRegeneratePreview` (called from the `/confirm` route) is hit.
 */
export async function buildRegeneratePreview(
  clipId: string,
  field: Exclude<RegenerateField, "subtitle" | "highlight">,
): Promise<RegeneratePreview> {
  const clip = await prisma.clip.findUniqueOrThrow({ where: { id: clipId } });
  const ai = await getAIProvider();
  const transcriptExcerpt = clip.reason ?? clip.title ?? "";

  let proposedValue: unknown;
  switch (field) {
    case "title":
      proposedValue = await ai.generateTitle({
        transcriptExcerpt, category: clip.category ?? "General", contentType: "GENERAL",
      });
      return { clipId, field, currentValue: clip.title, proposedValue };
    case "description":
      proposedValue = await ai.generateDescription({
        transcriptExcerpt, title: clip.title ?? "", contentType: "GENERAL",
      });
      return { clipId, field, currentValue: clip.description, proposedValue };
    case "hashtags":
      proposedValue = await ai.generateHashtags({
        transcriptExcerpt, category: clip.category ?? "General", contentType: "GENERAL",
      });
      return { clipId, field, currentValue: clip.hashtags, proposedValue };
    case "caption":
      proposedValue = await ai.generateCaption({
        title: clip.title ?? "", description: clip.description ?? "", hashtags: clip.hashtags,
      });
      return { clipId, field, currentValue: null, proposedValue };
  }
}

export async function applyRegeneratePreview(preview: RegeneratePreview): Promise<void> {
  const data: Record<string, unknown> = {};
  if (preview.field === "title") data.title = preview.proposedValue;
  if (preview.field === "description") data.description = preview.proposedValue;
  if (preview.field === "hashtags") data.hashtags = preview.proposedValue;
  if (preview.field === "caption") return; // caption is composed on the fly, not stored directly on Clip
  if (Object.keys(data).length > 0) {
    await prisma.clip.update({ where: { id: preview.clipId }, data });
  }
}

/** "New Subtitle" (spec section 47): re-runs subtitle-generation + render-video for this one clip. */
export async function regenerateSubtitle(clipId: string): Promise<void> {
  const clip = await prisma.clip.findUniqueOrThrow({ where: { id: clipId } });
  await prisma.clip.update({ where: { id: clipId }, data: { status: "PENDING" } });
  const { subtitleGenerationQueue } = await import("@/lib/queue/queues");
  await subtitleGenerationQueue.add("subtitle", { generationId: clip.generationId, clipId });
}

/**
 * "New Highlight" (spec section 47): rather than a fresh, expensive AI call,
 * picks the next-best-scoring candidate from the same video's original
 * `AIAnalysis.candidates` that (a) wasn't already selected for another clip
 * in this generation and (b) doesn't overlap it, then re-runs this clip's
 * full per-clip pipeline (cut -> auto-edit -> subtitle -> render) via the
 * existing queue chain. Title carries over from the new candidate
 * immediately; description/hashtags are best refreshed afterward via the
 * "description"/"hashtags" regenerate actions, since those depend on the
 * newly-rendered content.
 */
export async function regenerateHighlight(clipId: string): Promise<{ ok: boolean; message: string }> {
  const clip = await prisma.clip.findUniqueOrThrow({
    where: { id: clipId },
    include: { generation: { include: { video: true, clips: true } } },
  });

  const analysis = await prisma.aIAnalysis.findFirst({
    where: { videoId: clip.generation.videoId },
    orderBy: { createdAt: "desc" },
  });
  if (!analysis) return { ok: false, message: "No highlight analysis found for this video." };

  const allCandidates = analysis.candidates as unknown as HighlightCandidate[];
  const otherClips = clip.generation.clips.filter((c) => c.id !== clip.id);

  const unused = allCandidates
    .filter((c) => !otherClips.some((used) => timestampOverlapRatio(c, { start: used.startSec, end: used.endSec }) > 0.3))
    .filter((c) => timestampOverlapRatio(c, { start: clip.startSec, end: clip.endSec }) < 0.95) // must actually be different from current
    .sort((a, b) => b.score - a.score);

  const next = unused[0];
  if (!next) {
    return { ok: false, message: "No other distinct highlight moment is available in this video." };
  }

  await prisma.clip.update({
    where: { id: clip.id },
    data: {
      startSec: next.start,
      endSec: next.end,
      title: next.title,
      score: next.score,
      category: next.category,
      reason: next.reason,
      status: "PENDING",
      failureReason: null,
    },
  });

  await clipGenerationQueue.add("generate", { generationId: clip.generationId, clipId: clip.id });
  return { ok: true, message: "Regenerating this clip from a new highlight moment." };
}
