import { prisma } from "@/lib/db";

const DEFAULT_MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 2048);

/** Effective upload size limit (MB) for a user: admins get the global cap, others their per-user override if set. */
export async function getUploadSizeLimitMb(user: {
  id: string;
  role: string;
}): Promise<number> {
  if (user.role === "ADMIN") return DEFAULT_MAX_UPLOAD_SIZE_MB;
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { maxUploadSizeMb: true },
  });
  return dbUser?.maxUploadSizeMb ?? DEFAULT_MAX_UPLOAD_SIZE_MB;
}

export const VIDEO_EXTENSION_BY_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "video/x-msvideo": "avi",
};
