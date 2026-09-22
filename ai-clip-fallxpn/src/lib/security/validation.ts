import { z } from "zod";

// ── Auth ────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(200),
  name: z.string().trim().min(1).max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(200),
});

// ── Video ingestion ────────────────────────────────────────────────────

export const SUPPORTED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime", // .mov
  "video/webm",
  "video/x-matroska", // .mkv
  "video/x-msvideo", // .avi
] as const;

export const youtubeAnalyzeSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine(
      (url) => {
        try {
          const host = new URL(url).hostname.replace(/^www\./, "");
          return (
            host === "youtube.com" ||
            host === "m.youtube.com" ||
            host === "youtu.be" ||
            host === "music.youtube.com"
          );
        } catch {
          return false;
        }
      },
      { message: "URL must be a youtube.com or youtu.be link" },
    ),
  rightsConfirmed: z.literal(true, {
    errorMap: () => ({
      message: "You must confirm you have the rights to use this video",
    }),
  }),
});

// ── Generation settings (spec sections 2 & 4) ──────────────────────────

export const contentTypeEnum = z.enum([
  "FUNNY",
  "PODCAST",
  "GAMING",
  "STORY",
  "EDUCATION",
  "MOTIVATION",
  "DRAMA",
  "REACTION",
  "INTERVIEW",
  "NEWS",
  "GENERAL",
]);

export const aspectRatioEnum = z.enum(["RATIO_9_16", "RATIO_1_1", "RATIO_16_9"]);

export const subtitleStyleEnum = z.enum([
  "KARAOKE",
  "BOLD",
  "MINIMAL",
  "HIGHLIGHT_WORD",
  "PODCAST",
  "GAMING",
  "MODERN",
  "CLEAN",
]);

export const batchTextModeEnum = z.enum([
  "same_bio_same_cta_unique_description",
  "same_bio_same_all",
  "same_bio_unique_description_unique_hashtags",
  "full_unique",
]);

export const createGenerationSchema = z
  .object({
    videoId: z.string().cuid(),
    videoCount: z.number().int().min(1).max(40),
    contentType: contentTypeEnum,
    clipLengthMinSec: z.number().int().min(5).max(600),
    clipLengthMaxSec: z.number().int().min(5).max(600),
    aspectRatio: aspectRatioEnum.default("RATIO_9_16"),
    subtitleEnabled: z.boolean().default(true),
    subtitleStyle: subtitleStyleEnum.default("BOLD"),
    contentTemplateId: z.string().cuid().nullable().optional(),
    textVariantCount: z.number().int().min(1).max(10).default(1),
    batchTextMode: batchTextModeEnum.default(
      "same_bio_same_cta_unique_description",
    ),
    autoPostEnabled: z.boolean().default(false),
    tiktokAccountId: z.string().cuid().nullable().optional(),
    schedule: z
      .object({
        startAt: z.string().datetime(),
        intervalMin: z.number().int().min(1).max(1440),
        timezone: z.string().min(1).max(64),
      })
      .nullable()
      .optional(),
  })
  .refine((data) => data.clipLengthMaxSec >= data.clipLengthMinSec, {
    message: "clipLengthMaxSec must be >= clipLengthMinSec",
    path: ["clipLengthMaxSec"],
  })
  .refine(
    (data) => !data.autoPostEnabled || !!data.tiktokAccountId,
    {
      message: "tiktokAccountId is required when autoPostEnabled is true",
      path: ["tiktokAccountId"],
    },
  );

// ── Content templates (section 12) ─────────────────────────────────────

export const contentTemplateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  bio: z.string().trim().min(1).max(2000),
  cta: z.string().trim().max(500).optional(),
  hashtags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  description: z.string().trim().max(2000).optional(),
  titleFormat: z.string().trim().max(200).optional(),
});

// ── Clip editing ────────────────────────────────────────────────────────

export const updateClipSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(2000).optional(),
  hashtags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
});

// ── TikTok publish ──────────────────────────────────────────────────────

export const publishClipsSchema = z.object({
  clipIds: z.array(z.string().cuid()).min(1).max(40),
  tiktokAccountId: z.string().cuid(),
  privacyLevel: z
    .enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"])
    .default("SELF_ONLY"),
  schedule: z
    .object({
      startAt: z.string().datetime(),
      intervalMin: z.number().int().min(1).max(1440),
      timezone: z.string().min(1).max(64),
    })
    .nullable()
    .optional(),
});

export type CreateGenerationInput = z.infer<typeof createGenerationSchema>;
export type ContentTemplateInput = z.infer<typeof contentTemplateSchema>;
