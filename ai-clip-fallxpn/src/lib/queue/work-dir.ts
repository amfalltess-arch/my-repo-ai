import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

/**
 * Every worker in the pipeline needs a real local file to hand to
 * ffmpeg/whisper, regardless of which StorageDriver ultimately holds the
 * final assets. This keeps all of one generation's scratch files under a
 * single directory so they're easy to find and easy to wipe (spec section
 * 38: "Temporary processing files harus dibersihkan otomatis").
 */
export const WORK_DIR = process.env.WORKER_TMP_DIR || path.join(os.tmpdir(), "ai-clipflow");

export async function workDirFor(generationId: string): Promise<string> {
  const dir = path.join(WORK_DIR, generationId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function clipWorkDirFor(
  generationId: string,
  clipId: string,
): Promise<string> {
  const dir = path.join(WORK_DIR, generationId, "clips", clipId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Called once a generation is fully done (success or failure) and its outputs are safely in permanent storage. */
export async function cleanupWorkDir(generationId: string): Promise<void> {
  await fs.rm(path.join(WORK_DIR, generationId), {
    recursive: true,
    force: true,
  });
}
