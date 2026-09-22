import { NextResponse } from "next/server";
import { isServerless } from "@/lib/runtime";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  fetchYoutubeMetadata,
  fetchYoutubeMetadataViaOembed,
  YoutubeIngestError,
} from "@/lib/youtube/youtube";
import { youtubeAnalyzeSchema } from "@/lib/security/validation";
import { UnsafeUrlError } from "@/lib/security/ssrf-guard";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await enforceRateLimit({ key: `youtube-analyze:${user.id}`, limit: 20, windowSeconds: 3600 });

    const body = await request.json();
    const parsed = youtubeAnalyzeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // yt-dlp only exists on the worker image, not on Vercel/Netlify, so the web tier
    // reads metadata through oEmbed there (duration is then checked by the worker).
    const useOembed =
      isServerless() || process.env.YOUTUBE_METADATA_MODE === "oembed";
    const metadata = useOembed
      ? await fetchYoutubeMetadataViaOembed(parsed.data.url)
      : await fetchYoutubeMetadata(parsed.data.url);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    const maxDuration = dbUser?.maxVideoDurationSec ?? Number(process.env.MAX_VIDEO_DURATION_SEC ?? 14400);
    if (metadata.durationSec > 0 && metadata.durationSec > maxDuration) {
      return NextResponse.json(
        { error: `Video is ${Math.round(metadata.durationSec / 60)} min, which exceeds your ${Math.round(maxDuration / 60)} min limit.` },
        { status: 400 },
      );
    }

    const video = await prisma.video.create({
      data: {
        userId: user.id,
        sourceType: "YOUTUBE",
        sourceUrl: parsed.data.url,
        title: metadata.title,
        channel: metadata.channel,
        durationSec: metadata.durationSec > 0 ? metadata.durationSec : null,
        thumbnailUrl: metadata.thumbnailUrl,
        resolution: metadata.resolution,
        status: "READY",
        rightsConfirmed: true,
      },
    });

    return NextResponse.json({ video });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    if (err instanceof YoutubeIngestError || err instanceof UnsafeUrlError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("youtube analyze error:", err);
    return NextResponse.json({ error: "Could not analyze this URL." }, { status: 500 });
  }
}
