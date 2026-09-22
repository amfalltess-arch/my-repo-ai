import { randomUUID } from "node:crypto";
import type { AIProvider, TranscriptSegment } from "@/lib/ai/types";
import { hashFrameAt } from "@/lib/highlight/perceptual-hash";
import {
  selectDistinctHighlights,
  type EnrichedCandidate,
} from "@/lib/highlight/duplicate-detection";

function excerptFor(
  transcript: TranscriptSegment[],
  start: number,
  end: number,
): string {
  return transcript
    .filter((s) => s.start < end && s.end > start)
    .map((s) => s.text)
    .join(" ");
}

export interface HighlightDetectionResult {
  selected: EnrichedCandidate[];
  rejectedCount: number;
  insufficientMaterialReason: string | null;
}

/**
 * Full pipeline for the `highlight-detection` job (spec sections 5-6):
 * ask the AI provider for candidate moments, enrich each with its actual
 * transcript excerpt and a perceptual hash of a representative frame, then
 * greedily select up to `targetCount` genuinely distinct clips.
 */
export async function detectHighlights(params: {
  ai: AIProvider;
  sourcePath: string;
  transcript: TranscriptSegment[];
  contentType: string;
  targetCount: number;
  minDurationSec: number;
  maxDurationSec: number;
  videoDurationSec: number;
  language?: string;
}): Promise<HighlightDetectionResult> {
  const { candidates, insufficientMaterialReason } = await params.ai.findHighlights({
    transcript: params.transcript,
    contentType: params.contentType,
    targetCount: params.targetCount,
    minDurationSec: params.minDurationSec,
    maxDurationSec: params.maxDurationSec,
    videoDurationSec: params.videoDurationSec,
    language: params.language,
  });

  const enriched: EnrichedCandidate[] = await Promise.all(
    candidates.map(async (candidate) => {
      const midpoint = (candidate.start + candidate.end) / 2;
      let frameHash: string | undefined;
      try {
        frameHash = await hashFrameAt(params.sourcePath, midpoint);
      } catch {
        // A failed frame grab (e.g. a corrupt moment right at EOF) should
        // never sink the whole batch — just skip scene-similarity for it.
        frameHash = undefined;
      }
      return {
        ...candidate,
        id: randomUUID(),
        transcriptExcerpt: excerptFor(
          params.transcript,
          candidate.start,
          candidate.end,
        ),
        frameHash,
      };
    }),
  );

  const { selected, rejected } = selectDistinctHighlights(
    enriched,
    params.targetCount,
  );

  // "Jika video tidak memiliki cukup momen berkualitas, sistem boleh
  // menghasilkan lebih sedikit dan menjelaskan alasannya" — if the AI
  // already told us why, keep that; otherwise, if duplicate-filtering is
  // what brought us under the target, say so explicitly rather than
  // silently under-delivering.
  let reason = insufficientMaterialReason;
  if (!reason && selected.length < params.targetCount) {
    reason =
      `Only ${selected.length} sufficiently distinct moments were found in this video ` +
      `(source material didn't support ${params.targetCount} without near-duplicate clips).`;
  }

  return {
    selected,
    rejectedCount: rejected.filter((r) => r.reason !== "Target clip count already reached").length,
    insufficientMaterialReason: reason,
  };
}
