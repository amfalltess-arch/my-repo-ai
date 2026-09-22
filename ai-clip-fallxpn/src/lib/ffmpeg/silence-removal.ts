import type { SilenceRange } from "@/lib/ffmpeg/probe";
import type { TranscriptSegment, TranscriptWord } from "@/lib/ai/types";

export interface TimeRange {
  start: number;
  end: number;
}

/**
 * Inverts detected silences into the ranges to KEEP, padding each kept
 * range by `paddingSec` so words aren't clipped right at their edges, and
 * ignores silences shorter than `minGapSec` (a jump cut for every tiny
 * pause reads as jittery rather than tight).
 */
export function computeKeepRanges(
  totalDurationSec: number,
  silences: SilenceRange[],
  opts: { paddingSec?: number; minGapSec?: number } = {},
): TimeRange[] {
  const padding = opts.paddingSec ?? 0.12;
  const minGap = opts.minGapSec ?? 0.35;

  const significant = silences.filter((s) => s.end - s.start >= minGap);
  if (significant.length === 0) {
    return [{ start: 0, end: totalDurationSec }];
  }

  const keep: TimeRange[] = [];
  let cursor = 0;
  for (const silence of significant) {
    const cutStart = Math.max(cursor, silence.start + padding);
    const cutEnd = Math.min(totalDurationSec, silence.end - padding);
    if (cutStart > cursor) {
      keep.push({ start: cursor, end: cutStart });
    }
    cursor = Math.max(cursor, cutEnd);
  }
  if (cursor < totalDurationSec) {
    keep.push({ start: cursor, end: totalDurationSec });
  }
  return keep.filter((r) => r.end - r.start > 0.05);
}

/** ffmpeg filter_complex that keeps only the given ranges and closes the gaps (a jump cut). */
export function buildJumpCutFilter(keepRanges: TimeRange[]): string {
  const vLabels: string[] = [];
  const aLabels: string[] = [];
  const parts: string[] = [];

  keepRanges.forEach((range, i) => {
    parts.push(
      `[0:v]trim=start=${range.start.toFixed(3)}:end=${range.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
    );
    parts.push(
      `[0:a]atrim=start=${range.start.toFixed(3)}:end=${range.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`,
    );
    vLabels.push(`[v${i}]`);
    aLabels.push(`[a${i}]`);
  });

  const interleaved = keepRanges
    .map((_, i) => `${vLabels[i]}${aLabels[i]}`)
    .join("");
  parts.push(
    `${interleaved}concat=n=${keepRanges.length}:v=1:a=1[vout][aout]`,
  );

  return parts.join(";");
}

/** The new (post jump-cut) duration for a set of kept ranges. */
export function totalKeptDuration(keepRanges: TimeRange[]): number {
  return keepRanges.reduce((sum, r) => sum + (r.end - r.start), 0);
}

function mapTimeThroughKeepRanges(
  time: number,
  keepRanges: TimeRange[],
): number | null {
  let offset = 0;
  for (const range of keepRanges) {
    if (time < range.start) return null; // falls inside a removed gap before this range
    if (time <= range.end) return offset + (time - range.start);
    offset += range.end - range.start;
  }
  return null; // past the end of the last kept range
}

/**
 * Re-times a transcript onto the post-jump-cut timeline. Words/segments
 * that fall entirely inside a removed gap are dropped; segments that
 * straddle a cut boundary are trimmed to their surviving portion.
 */
export function remapTranscriptSegments(
  segments: TranscriptSegment[],
  keepRanges: TimeRange[],
): TranscriptSegment[] {
  const result: TranscriptSegment[] = [];

  for (const segment of segments) {
    const words = (segment.words ?? [])
      .map((w) => {
        const start = mapTimeThroughKeepRanges(w.start, keepRanges);
        const end = mapTimeThroughKeepRanges(w.end, keepRanges);
        if (start === null || end === null || end <= start) return null;
        return { word: w.word, start, end } satisfies TranscriptWord;
      })
      .filter((w): w is TranscriptWord => w !== null);

    if (segment.words && segment.words.length > 0) {
      if (words.length === 0) continue;
      result.push({
        start: words[0]!.start,
        end: words[words.length - 1]!.end,
        text: words.map((w) => w.word).join(" "),
        words,
      });
    } else {
      const start = mapTimeThroughKeepRanges(segment.start, keepRanges);
      const end = mapTimeThroughKeepRanges(segment.end, keepRanges);
      if (start === null || end === null || end <= start) continue;
      result.push({ start, end, text: segment.text });
    }
  }

  return result;
}
