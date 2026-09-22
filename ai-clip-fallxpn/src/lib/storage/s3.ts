import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageDriver } from "@/lib/storage/storage";
import { assertSafeStorageKey } from "@/lib/storage/storage";

export interface S3DriverConfig {
  endpoint?: string; // unset = real AWS S3; set to R2/MinIO endpoint otherwise
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean; // MinIO typically needs this true
  publicUrlBase?: string; // e.g. a CDN domain or R2 public bucket URL
}

/** One client class covers AWS S3, Cloudflare R2, and MinIO — they all speak the S3 API. */
export class S3StorageDriver implements StorageDriver {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlBase?: string;

  constructor(config: S3DriverConfig) {
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error(
        "S3_ACCESS_KEY / S3_SECRET_KEY are required when STORAGE_PROVIDER is s3/r2/minio.",
      );
    }
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      // Newer SDK versions add CRC32 checksum params to presigned URLs by
      // default, which R2/MinIO and plain browser PUTs reject. Only compute
      // checksums when the operation requires them.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucket = config.bucket;
    this.publicUrlBase = config.publicUrlBase;
  }

  async put(
    key: string,
    data: Buffer | NodeJS.ReadableStream,
    contentType?: string,
  ): Promise<string> {
    assertSafeStorageKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data as never,
        ContentType: contentType,
      }),
    );
    return key;
  }

  async get(key: string): Promise<Buffer> {
    assertSafeStorageKey(key);
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Object not found: ${key}`);
    return Buffer.from(bytes);
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    assertSafeStorageKey(key);
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) throw new Error(`Object not found: ${key}`);
    return result.Body as NodeJS.ReadableStream;
  }

  async delete(key: string): Promise<void> {
    assertSafeStorageKey(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async exists(key: string): Promise<boolean> {
    assertSafeStorageKey(key);
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async getUploadUrl(
    key: string,
    contentType: string,
    expiresInSec = 900,
  ): Promise<string> {
    assertSafeStorageKey(key);
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: expiresInSec },
    );
  }

  async getObjectSize(key: string): Promise<number | null> {
    assertSafeStorageKey(key);
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return head.ContentLength ?? 0;
    } catch {
      return null;
    }
  }

  async getPublicUrl(key: string, expiresInSec = 3600): Promise<string> {
    assertSafeStorageKey(key);
    if (this.publicUrlBase) {
      return `${this.publicUrlBase.replace(/\/+$/, "")}/${key}`;
    }
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSec },
    );
  }
}
