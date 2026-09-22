import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getStorageDriver, generateStorageKey } from "@/lib/storage/storage";
import { SUPPORTED_VIDEO_MIME_TYPES } from "@/lib/security/validation";
import {
  getUploadSizeLimitMb,
  VIDEO_EXTENSION_BY_MIME,
} from "@/lib/security/upload-limits";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(SUPPORTED_VIDEO_MIME_TYPES),
  sizeBytes: z.number().int().positive(),
  rightsConfirmed: z.literal(true),
});

/**
 * Step 1 of a direct-to-storage upload. Vercel functions reject request
 * bodies larger than 4.5 MB, so the browser must send the video straight to
 * S3/R2 with a presigned PUT URL instead of through this server. Step 2 is
 * `POST /api/videos` with the returned `storageKey` (JSON body).
 *
 * Returns `{ direct: false }` when the active storage driver cannot presign
 * (local disk in development); the client then falls back to the multipart
 * upload in `POST /api/videos`.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Invalid upload request. Supported types: MP4, MOV, WEBM, MKV, AVI, and you must confirm you have the rights to use the video.",
        },
        { status: 400 },
      );
    }
    const { mimeType, sizeBytes } = parsed.data;

    const limitMb = await getUploadSizeLimitMb(user);
    const sizeMb = sizeBytes / (1024 * 1024);
    if (sizeMb > limitMb) {
      return NextResponse.json(
        { error: `File is ${sizeMb.toFixed(0)}MB, which exceeds your ${limitMb}MB limit.` },
        { status: 400 },
      );
    }

    const storage = await getStorageDriver();
    if (!storage.getUploadUrl) {
      return NextResponse.json({ direct: false });
    }

    const extension = VIDEO_EXTENSION_BY_MIME[mimeType] ?? "mp4";
    const storageKey = generateStorageKey(`sources/${user.id}`, extension);
    const uploadUrl = await storage.getUploadUrl(storageKey, mimeType, 15 * 60);

    return NextResponse.json({
      direct: true,
      uploadUrl,
      storageKey,
      headers: { "Content-Type": mimeType },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("upload-url error:", err);
    return NextResponse.json({ error: "Could not prepare the upload." }, { status: 500 });
  }
}
