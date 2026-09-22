import { randomUUID } from "node:crypto";
import { isServerless } from "@/lib/runtime";

export interface StorageDriver {
  /** Writes a file and returns its storage key (NOT a public URL). */
  put(key: string, data: Buffer | NodeJS.ReadableStream, contentType?: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  getStream(key: string): Promise<NodeJS.ReadableStream>;
  delete(key: string): Promise<void>;
  /** A URL the browser/TikTok can fetch directly, valid for at least `expiresInSec`. */
  getPublicUrl(key: string, expiresInSec?: number): Promise<string>;
  exists(key: string): Promise<boolean>;
  /**
   * Optional: a short-lived presigned URL the browser can PUT a file to
   * directly (bypasses the app server; required on Vercel, whose functions
   * reject request bodies over 4.5 MB). Only S3-compatible drivers implement it.
   */
  getUploadUrl?(key: string, contentType: string, expiresInSec?: number): Promise<string>;
  /** Optional: size in bytes of a stored object, or null if it does not exist. */
  getObjectSize?(key: string): Promise<number | null>;
}

/**
 * Path-traversal protection (spec section 41): every storage key this
 * codebase generates is a random UUID plus a fixed suffix — never a
 * user-supplied filename — so a hostile filename can't smuggle `../` or an
 * absolute path into a storage key. This guard is a second line of defense
 * for local storage specifically, since that driver maps keys onto real
 * filesystem paths.
 */
export function assertSafeStorageKey(key: string): void {
  if (
    key.includes("..") ||
    key.startsWith("/") ||
    key.includes("\0") ||
    !/^[a-zA-Z0-9/_.-]+$/.test(key)
  ) {
    throw new Error(`Unsafe storage key rejected: ${key}`);
  }
}

let cachedDriver: StorageDriver | null = null;

export async function getStorageDriver(): Promise<StorageDriver> {
  if (cachedDriver) return cachedDriver;

  const provider = (process.env.STORAGE_PROVIDER ?? "local").toLowerCase();
  if (provider === "local") {
    if (isServerless()) {
      throw new Error(
        "STORAGE_PROVIDER=local cannot be used on Vercel/Netlify (read-only, ephemeral filesystem, " +
          "and the worker cannot see it). Set STORAGE_PROVIDER to s3, r2 or minio.",
      );
    }
    const { LocalStorageDriver } = await import("@/lib/storage/local");
    cachedDriver = new LocalStorageDriver(
      process.env.STORAGE_LOCAL_PATH ?? "./storage",
    );
  } else if (provider === "s3" || provider === "r2" || provider === "minio") {
    const { S3StorageDriver } = await import("@/lib/storage/s3");
    cachedDriver = new S3StorageDriver({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "auto",
      bucket: process.env.S3_BUCKET ?? "ai-clipflow",
      accessKeyId: process.env.S3_ACCESS_KEY ?? "",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      publicUrlBase: process.env.S3_PUBLIC_URL,
    });
  } else {
    throw new Error(`Unknown STORAGE_PROVIDER: ${provider}`);
  }

  return cachedDriver;
}

export function generateStorageKey(prefix: string, extension: string): string {
  return `${prefix}/${randomUUID()}.${extension.replace(/^\./, "")}`;
}
