import { describe, expect, it } from "vitest";
import { createGenerationSchema } from "@/lib/security/validation";

const base = {
  videoId: "clchtcp2a0000qzrm5b1c9k5j",
  videoCount: 10,
  contentType: "FUNNY" as const,
  clipLengthMinSec: 30,
  clipLengthMaxSec: 60,
};

describe("createGenerationSchema", () => {
  it("accepts a well-formed minimal payload", () => {
    const result = createGenerationSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("rejects clipLengthMaxSec smaller than clipLengthMinSec", () => {
    const result = createGenerationSchema.safeParse({
      ...base,
      clipLengthMinSec: 60,
      clipLengthMaxSec: 30,
    });
    expect(result.success).toBe(false);
  });

  it("rejects videoCount above the hard ceiling of 40", () => {
    const result = createGenerationSchema.safeParse({ ...base, videoCount: 41 });
    expect(result.success).toBe(false);
  });

  it("requires a tiktokAccountId when autoPostEnabled is true (spec section 22-23)", () => {
    const result = createGenerationSchema.safeParse({
      ...base,
      autoPostEnabled: true,
      tiktokAccountId: null,
    });
    expect(result.success).toBe(false);
  });

  it("allows autoPostEnabled true when a tiktokAccountId is provided", () => {
    const result = createGenerationSchema.safeParse({
      ...base,
      autoPostEnabled: true,
      tiktokAccountId: "clchtcp2a0000qzrm5b1c9k5j",
    });
    expect(result.success).toBe(true);
  });

  it("defaults aspectRatio to 9:16 when omitted (spec section 4)", () => {
    const result = createGenerationSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aspectRatio).toBe("RATIO_9_16");
    }
  });
});
