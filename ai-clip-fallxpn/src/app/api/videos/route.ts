import { NextResponse } from "next/server";
import { z } from "zod";
import { isServerless } from "@/lib/runtime";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getStorageDriver, generateStorageKey } from "@/lib/storage/storage";
import { probeMedia } from "@/lib/ffmpeg/probe";
import { SUPPORTED_VIDEO_MIME_TYPES } from "@/lib/security/validation";
import { assertSafeStorageKey } from "@/lib/storage/storage";
import { getUploadSizeLimitMb } from "@/lib/security/upload-limits";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 2048);

const registerUploadSchema = z.object({
  storageKey: z.string().min(1).max(300),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(SUPPORTED_VIDEO_MIME_TYPES),
  rightsConfirmed: z.literal(true),
});

/**
 * Step 2 of a direct-to-storage upload (see `POST /api/videos/upload-url`):
 * the browser already PUT the file to object storage; here we verify it is
 * really there, belongs to this user, respects the size limit, and register it.
 * Duration/resolution are read later by the worker (ffprobe is not available
 * in the web tier on Vercel).
 */
async function registerDirectUpload(request: Request) {
  const user = await requireUser();

  const parsed = registerUploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid upload registration. You must confirm you have the rights to use this video." },
      { status: 400 },
    );
  }
  const { storageKey, fileName, mimeType } = parsed.data;

  // The key must be one this user was issued, never someone else's object.
  try {
    assertSafeStorageKey(storageKey);
  } catch {
    return NextResponse.json({ error: "Invalid storage key." }, { status: 400 });
  }
  if (!storageKey.startsWith(`sources/${user.id}/`)) {
    return NextResponse.json({ error: "Invalid storage key." }, { status: 403 });
  }

  const storage = await getStorageDriver();
  if (!storage.getObjectSize) {
    return NextResponse.json(
      { error: "Direct upload is not supported by the active storage driver." },
      { status: 400 },
    );
  }
  const sizeBytes = await storage.getObjectSize(storageKey);
  if (sizeBytes === null) {
    return NextResponse.json(
      { error: "Upload not found in storage. The upload may have failed or expired; please try again." },
      { status: 400 },
    );
  }

  const limitMb = await getUploadSizeLimitMb(user);
  if (sizeBytes / (1024 * 1024) > limitMb) {
    await storage.delete(storageKey).catch(() => undefined);
    return NextResponse.json(
      { error: `File is ${(sizeBytes / (1024 * 1024)).toFixed(0)}MB, which exceeds your ${limitMb}MB limit.` },
      { status: 400 },
    );
  }

  const video = await prisma.video.create({
    data: {
      userId: user.id,
      sourceType: "UPLOAD",
      title: fileName,
      status: "READY",
      rightsConfirmed: true,
      assets: {
        create: { kind: "source", storageKey, mimeType, sizeBytes },
      },
    },
  });

  return NextResponse.json({ video });
}

export async function POST(request: Request) {
  try {
    if ((request.headers.get("content-type") ?? "").includes("application/json")) {
      return await registerDirectUpload(request);
    }

    // Serverless functions reject large bodies (~4.5 MB) and have no ffprobe, so the
    // multipart path below can only work on a self-hosted server.
    if (isServerless()) {
      return NextResponse.json(
        { error: "Direct-to-storage upload is required on this deployment." },
        { status: 400 },
      );
    }

    const user = await requireUser();

    const form = await request.formData();
    const file = form.get("file");
    const rightsConfirmed = form.get("rightsConfirmed") === "true";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (!rightsConfirmed) {
      return NextResponse.json(
        { error: "You must confirm you have the rights to use this video." },
        { status: 400 },
      );
    }
    if (!SUPPORTED_VIDEO_MIME_TYPES.includes(file.type as never)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Supported: MP4, MOV, WEBM, MKV, AVI.` },
        { status: 400 },
      );
    }
    const sizeMb = file.size / (1024 * 1024);
    const effectiveLimit = user.role === "ADMIN" ? MAX_UPLOAD_SIZE_MB : (
      (await prisma.user.findUnique({ where: { id: user.id } }))?.maxUploadSizeMb ?? MAX_UPLOAD_SIZE_MB
    );
    if (sizeMb > effectiveLimit) {
      return NextResponse.json(
        { error: `File is ${sizeMb.toFixed(0)}MB, which exceeds your ${effectiveLimit}MB limit.` },
        { status: 400 },
      );
    }

    // Buffer to a real temp file so ffprobe (which needs a filesystem path,
    // not an in-memory blob) can read it, and so MIME sniffing is against
    // actual bytes rather than a client-supplied Content-Type header.
    const tmpPath = path.join(os.tmpdir(), `acf-upload-${randomUUID()}`);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(tmpPath, buffer);

    let probe;
    try {
      probe = await probeMedia(tmpPath);
    } catch {
      await fs.rm(tmpPath, { force: true });
      return NextResponse.json(
        { error: "Could not read this file as a video. It may be corrupted or an unsupported codec." },
        { status: 400 },
      );
    }

    const maxDuration = user.role === "ADMIN" ? undefined : (
      (await prisma.user.findUnique({ where: { id: user.id } }))?.maxVideoDurationSec
    );
    if (maxDuration && probe.durationSec > maxDuration) {
      await fs.rm(tmpPath, { force: true });
      return NextResponse.json(
        { error: `Video is ${Math.round(probe.durationSec / 60)} min, which exceeds your ${Math.round(maxDuration / 60)} min limit.` },
        { status: 400 },
      );
    }

    const storage = await getStorageDriver();
    const extension = file.name.split(".").pop() || "mp4";
    const storageKey = generateStorageKey(`sources/${user.id}`, extension);
    await storage.put(storageKey, buffer, file.type);
    await fs.rm(tmpPath, { force: true });

    const video = await prisma.video.create({
      data: {
        userId: user.id,
        sourceType: "UPLOAD",
        title: file.name,
        durationSec: Math.round(probe.durationSec),
        resolution: `${probe.width}x${probe.height}`,
        status: "READY",
        rightsConfirmed: true,
        assets: {
          create: {
            kind: "source",
            storageKey,
            mimeType: file.type,
            sizeBytes: file.size,
          },
        },
      },
    });

    return NextResponse.json({ video });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("video upload error:", err);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    const videos = await prisma.video.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { generations: true } } },
    });
    return NextResponse.json({ videos });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("video list error:", err);
    return NextResponse.json({ error: "Could not load videos." }, { status: 500 });
  }
}
