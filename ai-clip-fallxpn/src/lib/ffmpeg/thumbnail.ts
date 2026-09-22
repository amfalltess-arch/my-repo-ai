import { runFfmpeg } from "@/lib/ffmpeg/ffmpeg";

/** Grabs a single frame partway into the clip to use as its result-grid thumbnail. */
export async function extractThumbnail(params: {
  inputPath: string;
  outputPath: string;
  atSec: number;
}): Promise<void> {
  await runFfmpeg([
    "-ss",
    params.atSec.toFixed(2),
    "-i",
    params.inputPath,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    params.outputPath,
  ]);
}
