import { spawn } from "node:child_process";

/**
 * Runs ffmpeg/ffprobe via `spawn` with an argument array and `shell: false`
 * (the default). This is the "safe argument array" requirement from the
 * spec: user-controlled values (titles, filenames, URLs) are passed as
 * separate array entries, never concatenated into a shell command string,
 * so there is no shell metacharacter injection surface.
 */
export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

export function runProcess(
  binary: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { shell: false });
    let stdout = "";
    let stderr = "";

    const timeout = opts.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`${binary} timed out after ${opts.timeoutMs}ms`));
        }, opts.timeoutMs)
      : undefined;

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      // Guard against unbounded memory growth on very verbose/long-running
      // encodes; ffmpeg's own progress spam can otherwise grow indefinitely.
      if (stderr.length > 2_000_000) {
        stderr = stderr.slice(-1_000_000);
      }
    });

    child.on("error", (err) => {
      if (timeout) clearTimeout(timeout);
      reject(new Error(`Failed to start ${binary}: ${err.message}`));
    });

    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}

export class FfmpegError extends Error {
  constructor(
    message: string,
    public stderr: string,
  ) {
    super(message);
    this.name = "FfmpegError";
  }
}

export async function runFfmpeg(args: string[], timeoutMs = 15 * 60 * 1000) {
  const binary = process.env.FFMPEG_PATH || "ffmpeg";
  // -y: overwrite output without prompting (there is no interactive stdin
  // in a worker process, so an unanswered prompt would just hang forever).
  // -hide_banner / -loglevel error: keep stderr focused on real problems.
  const fullArgs = ["-y", "-hide_banner", "-loglevel", "error", ...args];
  const result = await runProcess(binary, fullArgs, { timeoutMs });
  if (result.code !== 0) {
    throw new FfmpegError(
      `ffmpeg exited with code ${result.code}`,
      result.stderr,
    );
  }
  return result;
}

export async function runFfprobe(args: string[], timeoutMs = 30_000) {
  const binary = process.env.FFPROBE_PATH || "ffprobe";
  const result = await runProcess(binary, args, { timeoutMs });
  if (result.code !== 0) {
    throw new FfmpegError(
      `ffprobe exited with code ${result.code}`,
      result.stderr,
    );
  }
  return result;
}
