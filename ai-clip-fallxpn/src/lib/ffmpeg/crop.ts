/**
 * Builds the ffmpeg video filter graph that reframes a clip to a target
 * aspect ratio (spec section 7: "9:16 crop / Auto Reframe / Smart Crop").
 *
 * Two modes:
 *  - Static (default): one crop window for the whole clip, centered on a
 *    single focus point. This is what every clip gets today.
 *  - Dynamic: if the caller supplies more than one time-stamped focus point
 *    (`FocusPoint[]`), the clip is split into per-point segments, each
 *    cropped around its own focus point, then concatenated back together —
 *    real face/speaker *tracking* rather than a fixed window.
 *
 * Phase 1 does not ship a face/speaker detector, so callers only pass a
 * single focus point (or none, which defaults to dead-center). The dynamic
 * path exists and works today for anyone who wires up a detector (e.g. a
 * Python sidecar running a face-detection model) that emits
 * `FocusPoint[]` — see the README's "Extending" section.
 */

export interface FocusPoint {
  atSec: number; // seconds from the start of this clip
  x: number; // normalized 0-1, horizontal center of attention
  y: number; // normalized 0-1, vertical center of attention
}

export interface ReframeParams {
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  clipDurationSec: number;
  focusPoints?: FocusPoint[];
}

interface CropWindow {
  w: number;
  h: number;
  x: number;
  y: number;
}

function computeCropWindow(
  sourceWidth: number,
  sourceHeight: number,
  targetRatio: number,
  focus: { x: number; y: number },
): CropWindow {
  const sourceRatio = sourceWidth / sourceHeight;
  let w: number;
  let h: number;

  if (sourceRatio > targetRatio) {
    // Source is wider than target -> crop width, keep full height.
    h = sourceHeight;
    w = Math.round(h * targetRatio);
  } else {
    // Source is taller/narrower than target -> crop height, keep full width.
    w = sourceWidth;
    h = Math.round(w / targetRatio);
  }

  // Center the crop window on the focus point, clamped so it never runs
  // past the source frame edges.
  const idealX = focus.x * sourceWidth - w / 2;
  const idealY = focus.y * sourceHeight - h / 2;
  const x = Math.max(0, Math.min(sourceWidth - w, Math.round(idealX)));
  const y = Math.max(0, Math.min(sourceHeight - h, Math.round(idealY)));

  return { w, h, x, y };
}

/** Returns the `-filter_complex` string and whether it needs `-filter_complex` (dynamic) vs plain `-vf` (static). */
export function buildReframeFilter(params: ReframeParams): {
  filter: string;
  isComplex: boolean;
} {
  const targetRatio = params.outputWidth / params.outputHeight;
  const points =
    params.focusPoints && params.focusPoints.length > 0
      ? [...params.focusPoints].sort((a, b) => a.atSec - b.atSec)
      : [{ atSec: 0, x: 0.5, y: 0.5 }];

  if (points.length === 1) {
    const p = points[0]!;
    const win = computeCropWindow(
      params.sourceWidth,
      params.sourceHeight,
      targetRatio,
      p,
    );
    const filter =
      `crop=${win.w}:${win.h}:${win.x}:${win.y},` +
      `scale=${params.outputWidth}:${params.outputHeight}:force_original_aspect_ratio=decrease,` +
      `pad=${params.outputWidth}:${params.outputHeight}:(ow-iw)/2:(oh-ih)/2:color=black,` +
      `setsar=1`;
    return { filter, isComplex: false };
  }

  // Dynamic path: one segment per focus point, cropped independently, then
  // concatenated. Boundaries are the midpoints between consecutive points.
  const segments: string[] = [];
  const labels: string[] = [];

  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    const prevMid =
      i === 0 ? 0 : (points[i - 1]!.atSec + point.atSec) / 2;
    const nextMid =
      i === points.length - 1
        ? params.clipDurationSec
        : (point.atSec + points[i + 1]!.atSec) / 2;

    const win = computeCropWindow(
      params.sourceWidth,
      params.sourceHeight,
      targetRatio,
      point,
    );
    const label = `seg${i}`;
    segments.push(
      `[0:v]trim=start=${prevMid.toFixed(3)}:end=${nextMid.toFixed(3)},` +
        `setpts=PTS-STARTPTS,` +
        `crop=${win.w}:${win.h}:${win.x}:${win.y},` +
        `scale=${params.outputWidth}:${params.outputHeight}:force_original_aspect_ratio=decrease,` +
        `pad=${params.outputWidth}:${params.outputHeight}:(ow-iw)/2:(oh-ih)/2:color=black,` +
        `setsar=1[${label}]`,
    );
    labels.push(`[${label}]`);
  }

  const filter =
    segments.join(";") +
    `;${labels.join("")}concat=n=${labels.length}:v=1:a=0[vout]`;

  return { filter, isComplex: true };
}
