import { TikTokApiError } from "@/lib/tiktok/oauth";

/**
 * Official TikTok Content Posting API (Direct Post), per
 * https://developers.tiktok.com/doc/content-posting-api-reference-direct-post:
 *   Query creator info: POST /v2/post/publish/creator_info/query/
 *   Init:                POST /v2/post/publish/video/init/     (scope: video.publish)
 *   Upload:              PUT  {upload_url returned by init}    (FILE_UPLOAD source)
 *   Status:              POST /v2/post/publish/status/fetch/
 *   Cancel:              POST /v2/post/publish/cancel/
 *
 * Two important, easy-to-miss platform rules baked into this module:
 *  - Until TikTok audits your app, EVERY post is forced to `SELF_ONLY`
 *    (private) regardless of what the caller requests. This surfaces to the
 *    UI via `CreatorInfo.isAuditRequired` so the person isn't surprised.
 *  - `privacy_level` must be one of the creator's own
 *    `privacy_level_options` (some accounts, e.g. minors, don't have all
 *    four options) — always call `queryCreatorInfo` first and validate
 *    against it rather than trusting a hardcoded list.
 *
 * This implementation uses `FILE_UPLOAD` (we PUT the video bytes directly),
 * not `PULL_FROM_URL`, because PULL_FROM_URL requires verifying domain
 * ownership with TikTok first — FILE_UPLOAD works immediately for any app.
 */

const API_BASE = "https://open.tiktokapis.com/v2";
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB, within TikTok's allowed chunk range

export interface CreatorInfo {
  creatorAvatarUrl: string;
  creatorUsername: string;
  creatorNickname: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
  isAuditRequired: boolean; // true until your app passes TikTok's review
}

export async function queryCreatorInfo(accessToken: string): Promise<CreatorInfo> {
  const response = await fetch(`${API_BASE}/post/publish/creator_info/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
  const data = await response.json();
  if (!response.ok || data.error?.code !== "ok") {
    throw new TikTokApiError(
      `Failed to query TikTok creator info: ${data.error?.message ?? response.status}`,
    );
  }
  const d = data.data;
  return {
    creatorAvatarUrl: d.creator_avatar_url,
    creatorUsername: d.creator_username,
    creatorNickname: d.creator_nickname,
    privacyLevelOptions: d.privacy_level_options ?? [],
    commentDisabled: Boolean(d.comment_disabled),
    duetDisabled: Boolean(d.duet_disabled),
    stitchDisabled: Boolean(d.stitch_disabled),
    maxVideoPostDurationSec: d.max_video_post_duration_sec ?? 0,
    // TikTok doesn't expose "is my app audited" directly; in practice an
    // unaudited app silently overrides privacy_level server-side. We infer
    // it defensively: if PUBLIC_TO_EVERYONE isn't even offered as an
    // option, treat the app as unaudited so the UI can warn up front.
    isAuditRequired: !(d.privacy_level_options ?? []).includes("PUBLIC_TO_EVERYONE"),
  };
}

export interface InitDirectPostParams {
  accessToken: string;
  title: string;
  privacyLevel: string;
  videoSizeBytes: number;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  videoCoverTimestampMs?: number;
}

export interface InitDirectPostResult {
  publishId: string;
  uploadUrl: string;
  chunkSize: number;
  totalChunkCount: number;
}

export async function initDirectPost(
  params: InitDirectPostParams,
): Promise<InitDirectPostResult> {
  const totalChunkCount = Math.max(1, Math.ceil(params.videoSizeBytes / CHUNK_SIZE));
  const chunkSize =
    totalChunkCount === 1 ? params.videoSizeBytes : CHUNK_SIZE;

  const response = await fetch(`${API_BASE}/post/publish/video/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: params.title,
        privacy_level: params.privacyLevel,
        disable_comment: params.disableComment ?? false,
        disable_duet: params.disableDuet ?? false,
        disable_stitch: params.disableStitch ?? false,
        video_cover_timestamp_ms: params.videoCoverTimestampMs ?? 1000,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: params.videoSizeBytes,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error?.code !== "ok") {
    throw new TikTokApiError(
      `Failed to init TikTok direct post: ${data.error?.message ?? response.status}`,
    );
  }

  return {
    publishId: data.data.publish_id,
    uploadUrl: data.data.upload_url,
    chunkSize,
    totalChunkCount,
  };
}

/** Uploads the full video buffer to the URL returned by `initDirectPost`, chunked per TikTok's requirements. */
export async function uploadVideoChunks(params: {
  uploadUrl: string;
  video: Buffer;
  chunkSize: number;
  totalChunkCount: number;
}): Promise<void> {
  for (let i = 0; i < params.totalChunkCount; i++) {
    const start = i * params.chunkSize;
    const end = Math.min(start + params.chunkSize, params.video.length) - 1;
    const chunk = params.video.subarray(start, end + 1);

    const response = await fetch(params.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes ${start}-${end}/${params.video.length}`,
        "Content-Length": String(chunk.length),
      },
      body: new Uint8Array(chunk),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new TikTokApiError(
        `TikTok chunk upload failed at byte ${start}: ${response.status} ${body.slice(0, 300)}`,
      );
    }
  }
}

export type PublishStatusValue =
  | "PROCESSING_UPLOAD"
  | "PROCESSING_DOWNLOAD"
  | "SEND_TO_USER_INBOX"
  | "PUBLISH_COMPLETE"
  | "FAILED";

export interface PublishStatusResult {
  status: PublishStatusValue;
  failReason?: string;
  publiclyAvailablePostId?: string[];
}

export async function fetchPublishStatus(params: {
  accessToken: string;
  publishId: string;
}): Promise<PublishStatusResult> {
  const response = await fetch(`${API_BASE}/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id: params.publishId }),
  });

  const data = await response.json();
  if (!response.ok || data.error?.code !== "ok") {
    throw new TikTokApiError(
      `Failed to fetch TikTok publish status: ${data.error?.message ?? response.status}`,
    );
  }

  return {
    status: data.data.status,
    failReason: data.data.fail_reason,
    publiclyAvailablePostId: data.data.publicaly_available_post_id ?? data.data.publicly_available_post_id,
  };
}

export async function cancelPublish(params: {
  accessToken: string;
  publishId: string;
}): Promise<void> {
  await fetch(`${API_BASE}/post/publish/cancel/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id: params.publishId }),
  });
}

/**
 * TikTok's documented rate limit is 6 requests/minute per user access
 * token. `tiktok-publish.worker.ts` uses this to space out consecutive
 * calls for the same account rather than firing them back to back
 * (spec section 24: "Jangan melakukan 40 request secara bersamaan").
 */
export const TIKTOK_MIN_REQUEST_INTERVAL_MS = 10_000; // 6/min = 1 per 10s
