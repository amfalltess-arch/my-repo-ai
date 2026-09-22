import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import { runFfmpeg } from "@/lib/ffmpeg/ffmpeg";

const HASH_SIZE = 8; // 8x8 = 64-bit hash

/**
 * Classic average-hash (aHash): downscale a frame to 8x8 grayscale, compare
 * each pixel to the mean, and pack the bits into a hex string. Cheap and
 * good enough to catch "this is visually the same shot as an already-picked
 * clip" without pulling in a heavier perceptual-hash dependency.
 */
export async function hashFrameAt(
  sourcePath: string,
  atSec: number,
): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "acf-phash-"));
  const framePath = path.join(tmpDir, "frame.png");

  try {
    await runFfmpeg([
      "-ss",
      atSec.toFixed(2),
      "-i",
      sourcePath,
      "-frames:v",
      "1",
      framePath,
    ]);

    const { data } = await sharp(framePath)
      .resize(HASH_SIZE, HASH_SIZE, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const mean = data.reduce((sum, v) => sum + v, 0) / data.length;

    let bits = "";
    for (const value of data) {
      bits += value >= mean ? "1" : "0";
    }

    // Pack the 64-bit binary string into 16 hex characters.
    let hex = "";
    for (let i = 0; i < bits.length; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
