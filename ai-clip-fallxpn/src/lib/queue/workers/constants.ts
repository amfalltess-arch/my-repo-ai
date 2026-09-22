import type { AspectRatio } from "@prisma/client";

/** Spec section 4 "OUTPUT": 1080x1920 / 30 FPS / MP4 / H.264 / AAC for 9:16; matching resolutions for the other ratios. */
export const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, [number, number]> = {
  RATIO_9_16: [1080, 1920],
  RATIO_1_1: [1080, 1080],
  RATIO_16_9: [1920, 1080],
};

export const OUTPUT_FPS = 30;
