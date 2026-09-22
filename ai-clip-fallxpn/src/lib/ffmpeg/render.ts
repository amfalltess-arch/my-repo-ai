import path from "node:path";
import { runFfmpeg } from "@/lib/ffmpeg/ffmpeg";
import { buildReframeFilter, type FocusPoint } from "@/lib/ffmpeg/crop";
import {
  buildJumpCutFilter,
  computeKeepRanges,
  type TimeRange,
} from "@/lib/ffmpeg/silence-removal";
import { detectSilences } from "@/lib/ffmpeg/probe";

const OUTPUT_VIDEO_CODEC_ARGS = [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "20",
  "-pix_fmt",
  "yuv420p",
];
const OUTPUT_AUDIO_CODEC_ARGS = ["-c:a", "aac", "-b:a", "160k"];

/** Step 1: cut the AI-chosen segment out of the full source video. */
export async function cutSegment(params: {
  sourcePath: string;
  outputPath: string;
  startSec: number;
  endSec: number;
}): Promise<void> {
  const duration = params.endSec - params.startSec;
  await runFfmpeg([
    "-ss",
    params.startSec.toFixed(3),
    "-i",
    params.sourcePath,
    "-t",
    duration.toFixed(3),
    ...OUTPUT_VIDEO_CODEC_ARGS,
    ...OUTPUT_AUDIO_CODEC_ARGS,
    params.outputPath,
  ]);
}

export interface AutoEditOptions {
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  clipDurationSec: number;
  focusPoints?: FocusPoint[];
  removeSilence: boolean;
  normalizeAudio: boolean;
  reduceNoise: boolean;
}

export interface AutoEditResult {
  outputPath: string;
  /** Non-null only when silence was actually removed — callers must remap subtitle timing through these ranges. */
  keepRanges: TimeRange[] | null;
  newDurationSec: number;
}

/** Step 2: reframe to the target aspect ratio, optionally jump-cut silence, and clean up audio — one ffmpeg pass. */
export async function applyAutoEdit(
  inputPath: string,
  outputPath: string,
  opts: AutoEditOptions,
): Promise<AutoEditResult> {
  let keepRanges: TimeRange[] | null = null;
  let videoSource = "[0:v]";
  let audioSource = "[0:a]";
  const filterParts: string[] = [];

  if (opts.removeSilence) {
    const silences = await detectSilences(inputPath);
    const ranges = computeKeepRanges(opts.clipDurationSec, silences);
    const kept = ranges.reduce((s, r) => s + (r.end - r.start), 0);
    // Only worth a jump cut if it actually removes a meaningful chunk.
    if (kept < opts.clipDurationSec - 0.5 && ranges.length > 0) {
      keepRanges = ranges;
      filterParts.push(buildJumpCutFilter(ranges));
      videoSource = "[vout]";
      audioSource = "[aout]";
    }
  }

  const { filter: reframeFilter, isComplex } = buildReframeFilter({
    sourceWidth: opts.sourceWidth,
    sourceHeight: opts.sourceHeight,
    outputWidth: opts.outputWidth,
    outputHeight: opts.outputHeight,
    clipDurationSec: opts.clipDurationSec,
    focusPoints: opts.focusPoints,
  });

  let videoOutLabel: string;
  if (isComplex) {
    // The dynamic (multi-focus-point) reframe filter is itself a small
    // filter_complex graph that expects to read "[0:v]" and ends in
    // "[vout]" — rewrite its input to chain from the jump-cut stage (or the
    // raw input) and rename its output so it never collides with the
    // jump-cut filter's own "[vout]" label.
    filterParts.push(
      reframeFilter.replaceAll("[0:v]", videoSource).replaceAll("[vout]", "[vreframed]"),
    );
    videoOutLabel = "[vreframed]";
  } else {
    filterParts.push(`${videoSource}${reframeFilter}[vreframed]`);
    videoOutLabel = "[vreframed]";
  }

  const audioFilters: string[] = [];
  if (opts.reduceNoise) audioFilters.push("highpass=f=80", "afftdn=nf=-25");
  if (opts.normalizeAudio) audioFilters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  filterParts.push(
    audioFilters.length > 0
      ? `${audioSource}${audioFilters.join(",")}[afinal]`
      : `${audioSource}anull[afinal]`,
  );

  await runFfmpeg([
    "-i",
    inputPath,
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    videoOutLabel,
    "-map",
    "[afinal]",
    ...OUTPUT_VIDEO_CODEC_ARGS,
    ...OUTPUT_AUDIO_CODEC_ARGS,
    outputPath,
  ]);

  const newDurationSec = keepRanges
    ? keepRanges.reduce((s, r) => s + (r.end - r.start), 0)
    : opts.clipDurationSec;

  return { outputPath, keepRanges, newDurationSec };
}

/** Step 3: burn the pre-styled .ass subtitle file into the final output. */
export async function burnSubtitles(params: {
  inputPath: string;
  assPath: string;
  outputPath: string;
}): Promise<void> {
  // ffmpeg's subtitle filters need a path with no characters that would
  // break its internal mini-parser (colons in particular on some builds).
  // Since we control the temp directory this is always a plain safe path,
  // but the escaping is defensive in case that ever changes.
  const escapedAssPath = params.assPath.replace(/([:\\])/g, "\\$1");
  await runFfmpeg([
    "-i",
    params.inputPath,
    "-vf",
    `ass=${escapedAssPath}`,
    ...OUTPUT_VIDEO_CODEC_ARGS,
    "-c:a",
    "copy",
    params.outputPath,
  ]);
}

export function tempPath(dir: string, name: string): string {
  return path.join(dir, name);
}
