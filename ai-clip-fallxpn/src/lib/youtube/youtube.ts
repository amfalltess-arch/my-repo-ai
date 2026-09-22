import { runProcess } from "@/lib/ffmpeg/ffmpeg";
import { assertSafeUrl } from "@/lib/security/ssrf-guard";

/**
 * Spec section 3: "Hanya proses content yang user memiliki hak/izin untuk
 * digunakan. Jangan membuat fitur untuk bypass DRM, private video, login
 * protection, atau restriction platform."
 *
 * This module deliberately never passes cookies, session tokens, or any
 * age/region-bypass flags to yt-dlp — it can only ever reach whatever a
 * logged-out browser in the server's own region could see. A private,
 * age-gated, or region-blocked video simply fails, by design, with a clear
 * error rather than silently working around the restriction.
 *
 * Downloading video content from YouTube also sits in a legal gray area
 * under YouTube's own Terms of Service even when the uploader has given the
 * end user permission to reuse it — that tension isn't fully resolved by
 * software alone. This is why `Video.rightsConfirmed` exists as an explicit,
 * logged user attestation (spec section 3), and why file upload — where the
 * user obviously already has the bytes — is the primary path, with YouTube
 * URL import offered as a convenience on top.
 */

export interface YoutubeMetadata {
  title: string;
  channel: string;
  durationSec: number;
  thumbnailUrl: string;
  resolution: string;
  isPrivateOrRestricted: boolean;
}

function ytDlpBinary(): string {
  return process.env.YTDLP_PATH || "yt-dlp";
}

export async function fetchYoutubeMetadata(url: string): Promise<YoutubeMetadata> {
  await assertSafeUrl(url); // hostname allowlist already enforced by youtubeAnalyzeSchema; this also blocks DNS-rebinding tricks

  const result = await runProcess(
    ytDlpBinary(),
    [
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      // Explicitly no --cookies, --username/--password, or age-bypass flags.
      url,
    ],
    { timeoutMs: 30_000 },
  );

  if (result.code !== 0) {
    const stderr = result.stderr.toLowerCase();
    const restricted =
      stderr.includes("private") ||
      stderr.includes("sign in") ||
      stderr.includes("age") ||
      stderr.includes("unavailable");
    throw new YoutubeIngestError(
      restricted
        ? "This video is private, age-restricted, or otherwise unavailable without login. " +
          "AI ClipFlow only processes publicly accessible videos."
        : `Could not read video metadata: ${result.stderr.slice(0, 300)}`,
    );
  }

  const info = JSON.parse(result.stdout) as {
    title?: string;
    uploader?: string;
    channel?: string;
    duration?: number;
    thumbnail?: string;
    width?: number;
    height?: number;
    availability?: string;
  };

  const isPrivateOrRestricted =
    info.availability != null &&
    !["public", "unlisted"].includes(info.availability);

  if (isPrivateOrRestricted) {
    throw new YoutubeIngestError(
      "This video is not publicly available. AI ClipFlow does not bypass " +
        "private-video or login restrictions.",
    );
  }

  return {
    title: info.title ?? "Untitled",
    channel: info.channel ?? info.uploader ?? "Unknown channel",
    durationSec: Math.round(info.duration ?? 0),
    thumbnailUrl: info.thumbnail ?? "",
    resolution: info.width && info.height ? `${info.width}x${info.height}` : "unknown",
    isPrivateOrRestricted: false,
  };
}

/**
 * Lightweight metadata lookup through YouTube's public oEmbed endpoint. It
 * needs no yt-dlp binary, so it works in serverless environments such as
 * Vercel. oEmbed does not expose duration or resolution, so those are left
 * empty here; the worker (which has yt-dlp + ffprobe) fills them in and
 * enforces duration limits when the generation starts.
 */
export async function fetchYoutubeMetadataViaOembed(
  url: string,
): Promise<YoutubeMetadata> {
  await assertSafeUrl(url);

  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  let res: Response;
  try {
    res = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new YoutubeIngestError("Could not reach YouTube to read this video. Try again shortly.");
  }
  if (!res.ok) {
    throw new YoutubeIngestError(
      "This video is private, unavailable, or does not allow embedding. " +
        "AI ClipFlow only processes publicly accessible videos.",
    );
  }

  const info = (await res.json()) as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  };

  return {
    title: info.title ?? "Untitled",
    channel: info.author_name ?? "Unknown channel",
    durationSec: 0,
    thumbnailUrl: info.thumbnail_url ?? "",
    resolution: "unknown",
    isPrivateOrRestricted: false,
  };
}

export async function downloadYoutubeVideo(params: {
  url: string;
  outputPath: string;
  maxDurationSec?: number;
}): Promise<void> {
  await assertSafeUrl(params.url);

  if (params.maxDurationSec) {
    const meta = await fetchYoutubeMetadata(params.url);
    if (meta.durationSec > params.maxDurationSec) {
      throw new YoutubeIngestError(
        `Video is ${Math.round(meta.durationSec / 60)} min, which exceeds the ` +
          `${Math.round(params.maxDurationSec / 60)} min limit for this account.`,
      );
    }
  }

  const result = await runProcess(
    ytDlpBinary(),
    [
      "-f",
      "bv*[height<=1080]+ba/b[height<=1080]",
      "--merge-output-format",
      "mp4",
      "--no-playlist",
      "--no-warnings",
      "-o",
      params.outputPath,
      params.url,
    ],
    { timeoutMs: 20 * 60 * 1000 },
  );

  if (result.code !== 0) {
    throw new YoutubeIngestError(
      `Download failed: ${result.stderr.slice(0, 500)}`,
    );
  }
}

export class YoutubeIngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YoutubeIngestError";
  }
}
