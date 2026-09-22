import { runFfprobe } from "@/lib/ffmpeg/ffmpeg";

export interface MediaProbe {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

export async function probeMedia(filePath: string): Promise<MediaProbe> {
  const result = await runFfprobe([
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);

  const data = JSON.parse(result.stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
    }>;
  };

  const videoStream = data.streams?.find((s) => s.codec_type === "video");
  const audioStream = data.streams?.find((s) => s.codec_type === "audio");

  if (!videoStream) {
    throw new Error("No video stream found in file.");
  }

  const [num = 30, den = 1] = (videoStream.r_frame_rate ?? "30/1")
    .split("/")
    .map(Number);
  const fps = den ? num / den : num;

  return {
    durationSec: Number(data.format?.duration ?? 0),
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    fps: Number.isFinite(fps) ? fps : 30,
    hasAudio: Boolean(audioStream),
  };
}

/** Detects silent stretches via ffmpeg's silencedetect filter, for the "Silence Removal" auto-edit step. */
export interface SilenceRange {
  start: number;
  end: number;
}

export async function detectSilences(
  filePath: string,
  opts: { noiseDb?: number; minDurationSec?: number } = {},
): Promise<SilenceRange[]> {
  const { runFfmpeg } = await import("@/lib/ffmpeg/ffmpeg");
  const noiseDb = opts.noiseDb ?? -35;
  const minDuration = opts.minDurationSec ?? 0.5;

  // ffmpeg writes silencedetect output to stderr even on success; we run it
  // with no real output file (-f null -) purely to capture that log.
  let stderr = "";
  try {
    await runFfmpeg([
      "-i",
      filePath,
      "-af",
      `silencedetect=noise=${noiseDb}dB:d=${minDuration}`,
      "-f",
      "null",
      "-",
    ]);
  } catch (err) {
    // runFfmpeg throws FfmpegError with .stderr attached even though the
    // "error" here is expected (there's no real output stream).
    if (err && typeof err === "object" && "stderr" in err) {
      stderr = String((err as { stderr: string }).stderr);
    } else {
      throw err;
    }
  }

  const ranges: SilenceRange[] = [];
  const startMatches = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)];
  const endMatches = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)];
  for (let i = 0; i < Math.min(startMatches.length, endMatches.length); i++) {
    ranges.push({
      start: Number(startMatches[i]?.[1]),
      end: Number(endMatches[i]?.[1]),
    });
  }
  return ranges;
}
