import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { StorageDriver } from "@/lib/storage/storage";
import { assertSafeStorageKey } from "@/lib/storage/storage";

/**
 * Meant for local development or a single-VPS deployment where the app and
 * worker share a disk. For anything horizontally scaled across multiple
 * machines, use the S3-compatible driver instead (S3/R2/MinIO all work,
 * see `s3.ts`) so every worker/app instance sees the same files.
 */
export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  private resolvePath(key: string): string {
    assertSafeStorageKey(key);
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(this.root + path.sep) && resolved !== this.root) {
      throw new Error(`Storage key escapes root directory: ${key}`);
    }
    return resolved;
  }

  async put(
    key: string,
    data: Buffer | NodeJS.ReadableStream,
  ): Promise<string> {
    const filePath = this.resolvePath(key);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });

    if (Buffer.isBuffer(data)) {
      await fsp.writeFile(filePath, data);
    } else {
      await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(filePath);
        data.pipe(writeStream);
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
        data.on("error", reject);
      });
    }
    return key;
  }

  async get(key: string): Promise<Buffer> {
    return fsp.readFile(this.resolvePath(key));
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    return fs.createReadStream(this.resolvePath(key));
  }

  async delete(key: string): Promise<void> {
    await fsp.rm(this.resolvePath(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fsp.access(this.resolvePath(key));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * There's no real "signed URL" concept for a bare local filesystem, so
   * this issues a short-lived HMAC-signed token that
   * `GET /api/files/[...key]` (not yet built in Phase 1 — see README)
   * verifies before streaming the file back. Good enough for local dev;
   * production deployments should use the S3-compatible driver instead.
   */
  async getPublicUrl(key: string, expiresInSec = 3600): Promise<string> {
    const expires = Date.now() + expiresInSec * 1000;
    const secret = process.env.SESSION_SECRET ?? "";
    const signature = createHash("sha256")
      .update(`${key}:${expires}:${secret}`)
      .digest("hex");
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    return `${base}/api/files/${encodeURIComponent(key)}?expires=${expires}&sig=${signature}`;
  }
}
