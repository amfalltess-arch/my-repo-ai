import type { HighlightCandidate } from "@/lib/ai/types";

/**
 * Spec section 6: "40 clips harus berbeda" — implemented via three
 * independent signals, all of which must pass for two candidates to be
 * considered distinct enough to keep both:
 *   1. Timestamp overlap (IoU of their [start, end] ranges)
 *   2. Transcript similarity (token-level Jaccard over what's actually said)
 *   3. Scene similarity (perceptual-hash Hamming distance of a representative frame)
 *
 * Deliberately pure/side-effect-free so it's cheap to unit test — frame
 * extraction and hashing (real I/O) live in `perceptual-hash.ts`, called by
 * `highlight-service.ts` before candidates ever reach this module.
 */

export function timestampOverlapRatio(
  a: { start: number; end: number },
  b: { start: number; end: number },
): number {
  const overlapStart = Math.max(a.start, b.start);
  const overlapEnd = Math.min(a.end, b.end);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  if (overlap === 0) return 0;
  const union =
    Math.max(a.end, b.end) - Math.min(a.start, b.start);
  return union > 0 ? overlap / union : 0;
}

/** Token-level Jaccard similarity (0-1) between two transcript excerpts. */
export function transcriptSimilarity(textA: string, textB: string): number {
  const tokenize = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .split(/\s+/)
        .filter(Boolean),
    );
  const setA = tokenize(textA);
  const setB = tokenize(textB);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Hamming distance between two same-length hex perceptual hashes (lower = more similar). */
export function hammingDistance(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length) return Number.MAX_SAFE_INTEGER;
  let distance = 0;
  for (let i = 0; i < hashA.length; i++) {
    const a = parseInt(hashA[i]!, 16);
    const b = parseInt(hashB[i]!, 16);
    let xor = a ^ b;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

export interface EnrichedCandidate extends HighlightCandidate {
  id: string;
  transcriptExcerpt: string;
  frameHash?: string;
}

export interface DuplicateThresholds {
  maxOverlapRatio: number; // reject if overlap ratio exceeds this
  maxTranscriptSimilarity: number; // reject if Jaccard similarity exceeds this
  maxHammingDistanceForDuplicate: number; // hashes closer than this are "the same scene"
}

export const DEFAULT_THRESHOLDS: DuplicateThresholds = {
  maxOverlapRatio: 0.3,
  maxTranscriptSimilarity: 0.75,
  maxHammingDistanceForDuplicate: 6, // out of a 64-bit hash
};

/**
 * Greedily walks candidates best-score-first, keeping a candidate only if
 * it clears all three distinctness checks against every candidate already
 * accepted. Returns up to `targetCount` selections plus whatever was
 * rejected and why (surfaced in generation logs / the "37 successful, 3
 * skipped as duplicates" style reporting).
 */
export function selectDistinctHighlights(
  candidates: EnrichedCandidate[],
  targetCount: number,
  thresholds: DuplicateThresholds = DEFAULT_THRESHOLDS,
): {
  selected: EnrichedCandidate[];
  rejected: Array<{ candidate: EnrichedCandidate; reason: string }>;
} {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const selected: EnrichedCandidate[] = [];
  const rejected: Array<{ candidate: EnrichedCandidate; reason: string }> = [];

  for (const candidate of sorted) {
    if (selected.length >= targetCount) break;

    const conflict = selected.find((kept) => {
      const overlap = timestampOverlapRatio(candidate, kept);
      if (overlap > thresholds.maxOverlapRatio) return true;

      const similarity = transcriptSimilarity(
        candidate.transcriptExcerpt,
        kept.transcriptExcerpt,
      );
      if (similarity > thresholds.maxTranscriptSimilarity) return true;

      if (candidate.frameHash && kept.frameHash) {
        const distance = hammingDistance(candidate.frameHash, kept.frameHash);
        if (distance <= thresholds.maxHammingDistanceForDuplicate) return true;
      }

      return false;
    });

    if (conflict) {
      const overlap = timestampOverlapRatio(candidate, conflict);
      const similarity = transcriptSimilarity(
        candidate.transcriptExcerpt,
        conflict.transcriptExcerpt,
      );
      const reason =
        overlap > thresholds.maxOverlapRatio
          ? `Overlaps ${(overlap * 100).toFixed(0)}% with an already-selected clip`
          : similarity > thresholds.maxTranscriptSimilarity
            ? "Says essentially the same thing as an already-selected clip"
            : "Visually near-identical to an already-selected clip";
      rejected.push({ candidate, reason });
      continue;
    }

    selected.push(candidate);
  }

  // Whatever didn't fit purely because we already hit targetCount (not a
  // real duplicate) still gets reported so the UI can distinguish
  // "filtered as a duplicate" from "there just wasn't room."
  for (const candidate of sorted) {
    if (
      selected.length >= targetCount &&
      !selected.includes(candidate) &&
      !rejected.some((r) => r.candidate.id === candidate.id)
    ) {
      rejected.push({ candidate, reason: "Target clip count already reached" });
    }
  }

  return { selected, rejected };
}
