import { runProcess } from "@/lib/ffmpeg/ffmpeg";
import type { TranscriptSegment } from "@/lib/ai/types";

/**
 * Word-level transcription (spec section 8: "Jika tersedia word-level
 * timestamps: Gunakan word-level animation"). Runs on the worker/VPS, never
 * inside a serverless function (spec section 50) — this module is only ever
 * imported from `src/lib/queue/workers/*`, never from a Next.js route.
 *
 * Two supported backends, in priority order:
 *  1. `WHISPER_SERVICE_URL` — an HTTP call to a self-hosted transcription
 *     service (e.g. a faster-whisper server exposing a
 *     `POST /transcribe` endpoint). Recommended for anything beyond
 *     hobby-scale, since it lets the heavy model stay loaded in memory
 *     across jobs instead of a fresh process per clip.
 *  2. `WHISPER_BINARY_PATH` — shells out to a local whisper-compatible CLI
 *     (e.g. whisper.cpp's `whisper-cli`, or openai-whisper's `whisper`)
 *     that can emit word-level JSON.
 */
export async function transcribeAudio(params: {
  filePath: string;
  language?: string;
}): Promise<TranscriptSegment[]> {
  const serviceUrl = process.env.WHISPER_SERVICE_URL;
  if (serviceUrl) {
    return transcribeViaHttpService(serviceUrl, params);
  }
  return transcribeViaLocalBinary(params);
}

async function transcribeViaHttpService(
  serviceUrl: string,
  params: { filePath: string; language?: string },
): Promise<TranscriptSegment[]> {
  const fs = await import("node:fs");
  const form = new FormData();
  const fileBuffer = await fs.promises.readFile(params.filePath);
  form.append(
    "file",
    new Blob([fileBuffer]),
    params.filePath.split("/").pop() ?? "audio.wav",
  );
  form.append("word_timestamps", "true");
  if (params.language) form.append("language", params.language);

  const response = await fetch(`${serviceUrl.replace(/\/+$/, "")}/transcribe`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Whisper service returned ${response.status}: ${body.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as {
    segments: Array<{
      start: number;
      end: number;
      text: string;
      words?: Array<{ word: string; start: number; end: number }>;
    }>;
  };

  return normalizeSegments(data.segments);
}

async function transcribeViaLocalBinary(params: {
  filePath: string;
  language?: string;
}): Promise<TranscriptSegment[]> {
  const os = await import("node:os");
  const fs = await import("node:fs");
  const path = await import("node:path");

  const binary = process.env.WHISPER_BINARY_PATH || "whisper";
  const model = process.env.WHISPER_MODEL || "medium";
  const outDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "acf-whisper-"),
  );

  const args = [
    params.filePath,
    "--model",
    model,
    "--output_format",
    "json",
    "--output_dir",
    outDir,
    "--word_timestamps",
    "True",
  ];
  if (params.language) args.push("--language", params.language);

  const result = await runProcess(binary, args, { timeoutMs: 30 * 60 * 1000 });
  if (result.code !== 0) {
    throw new Error(`Whisper binary failed: ${result.stderr.slice(-2000)}`);
  }

  const base = path.basename(
    params.filePath,
    path.extname(params.filePath),
  );
  const jsonPath = path.join(outDir, `${base}.json`);
  const raw = JSON.parse(await fs.promises.readFile(jsonPath, "utf8")) as {
    segments: Array<{
      start: number;
      end: number;
      text: string;
      words?: Array<{ word: string; start: number; end: number }>;
    }>;
  };

  await fs.promises.rm(outDir, { recursive: true, force: true }).catch(() => undefined);

  return normalizeSegments(raw.segments);
}

function normalizeSegments(
  segments: Array<{
    start: number;
    end: number;
    text: string;
    words?: Array<{ word: string; start: number; end: number }>;
  }>,
): TranscriptSegment[] {
  return segments.map((s) => ({
    start: s.start,
    end: s.end,
    text: s.text.trim(),
    words: s.words?.map((w) => ({
      word: w.word.trim(),
      start: w.start,
      end: w.end,
    })),
  }));
}
