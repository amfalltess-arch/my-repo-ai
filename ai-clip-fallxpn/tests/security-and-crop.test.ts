import { describe, expect, it, beforeAll } from "vitest";
import crypto from "node:crypto";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext value", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/security/encryption");
    const plaintext = "sk-super-secret-api-key-12345";
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV) even for the same input", async () => {
    const { encryptSecret } = await import("@/lib/security/encryption");
    const a = encryptSecret("same value");
    const b = encryptSecret("same value");
    expect(a).not.toBe(b);
  });

  it("throws rather than silently succeeding when the payload is tampered with", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/security/encryption");
    const encrypted = encryptSecret("value");
    const [iv, tag, data] = encrypted.split(":");
    const tampered = `${iv}:${tag}:${data!.slice(0, -2)}ff`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("hashToken", () => {
  it("is deterministic", async () => {
    const { hashToken } = await import("@/lib/security/encryption");
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("differs for different inputs", async () => {
    const { hashToken } = await import("@/lib/security/encryption");
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});

describe("buildReframeFilter", () => {
  it("crops a 16:9 source down to 9:16 by trimming width, keeping full height", async () => {
    const { buildReframeFilter } = await import("@/lib/ffmpeg/crop");
    const { filter, isComplex } = buildReframeFilter({
      sourceWidth: 1920,
      sourceHeight: 1080,
      outputWidth: 1080,
      outputHeight: 1920,
      clipDurationSec: 30,
    });
    expect(isComplex).toBe(false);
    // height should stay full (1080), width should shrink to 1080 * 9/16 = 607.5 -> 608 (rounded)
    expect(filter).toContain("crop=608:1080");
  });

  it("centers the crop window on a single focus point", async () => {
    const { buildReframeFilter } = await import("@/lib/ffmpeg/crop");
    const { filter } = buildReframeFilter({
      sourceWidth: 1920,
      sourceHeight: 1080,
      outputWidth: 1080,
      outputHeight: 1920,
      clipDurationSec: 30,
      focusPoints: [{ atSec: 0, x: 0.1, y: 0.5 }], // focus near the left edge
    });
    // With the focus near x=0.1 (192px) and a 608px-wide window, the ideal
    // left edge would be negative, so it should clamp to 0 rather than go
    // off-frame.
    expect(filter).toContain("crop=608:1080:0:0");
  });

  it("switches to a multi-segment concat filter when given more than one focus point", async () => {
    const { buildReframeFilter } = await import("@/lib/ffmpeg/crop");
    const { isComplex, filter } = buildReframeFilter({
      sourceWidth: 1920,
      sourceHeight: 1080,
      outputWidth: 1080,
      outputHeight: 1920,
      clipDurationSec: 10,
      focusPoints: [
        { atSec: 0, x: 0.2, y: 0.5 },
        { atSec: 5, x: 0.8, y: 0.5 },
      ],
    });
    expect(isComplex).toBe(true);
    expect(filter).toContain("concat=n=2:v=1:a=0");
  });
});
