import { z } from "zod";

// ── Transcript shapes (produced by the transcription worker / Whisper) ───

export interface TranscriptWord {
  word: string;
  start: number; // seconds
  end: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
}

// ── Zod schemas mirroring each AIProvider method's expected JSON shape ───
// These are the single source of truth: `zodToGeminiSchema()` derives
// Gemini's `responseSchema` from them, and `.parse()` validates whatever
// comes back from either provider before it ever reaches the database.

export const transcriptAnalysisSchema = z.object({
  summary: z.string().describe("2-3 sentence summary of what the video is about"),
  topics: z.array(z.string()).describe("Short topic keywords"),
  tone: z.string().describe("Overall tone, e.g. 'comedic', 'serious', 'educational'"),
  language: z.string().describe("BCP-47-ish language name, e.g. 'Indonesian', 'English'"),
});
export type TranscriptAnalysis = z.infer<typeof transcriptAnalysisSchema>;

export const highlightCandidateSchema = z.object({
  start: z.number().describe("Start time in seconds from the beginning of the source video"),
  end: z.number().describe("End time in seconds"),
  title: z.string().describe("Short punchy working title for this moment"),
  reason: z.string().describe("Why this moment was chosen, one sentence"),
  score: z.number().int().min(0).max(100),
  category: z.string().describe(
    "One of: Hook, Story, Emotion, Reaction, Funny, Unexpected, Information, Punchline, QnA, Payoff",
  ),
});
export type HighlightCandidate = z.infer<typeof highlightCandidateSchema>;

export const highlightCandidateListSchema = z.object({
  candidates: z.array(highlightCandidateSchema),
  insufficientMaterialReason: z
    .string()
    .nullable()
    .describe(
      "Non-null only if the source material does not contain enough distinct " +
        "quality moments to hit the requested count — explain briefly why.",
    ),
});

export const titleResultSchema = z.object({ title: z.string().max(150) });
export const descriptionResultSchema = z.object({ description: z.string().max(2000) });
export const hashtagsResultSchema = z.object({
  hashtags: z.array(z.string().min(1).max(50)).max(20),
});

export const textVariantSchema = z.object({
  label: z.string().describe("Single letter label: A, B, C, ..."),
  text: z.string(),
});
export const textVariantListSchema = z.object({
  variants: z.array(textVariantSchema),
});
export type TextVariantResult = z.infer<typeof textVariantSchema>;

export const captionResultSchema = z.object({ caption: z.string().max(2200) });
export const bioResultSchema = z.object({ bio: z.string().max(1000) });
export const clipScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  reason: z.string(),
});

// ── Method input parameter types ─────────────────────────────────────────

export interface AnalyzeTranscriptInput {
  transcript: TranscriptSegment[];
  language?: string;
}

export interface FindHighlightsInput {
  transcript: TranscriptSegment[];
  contentType: string;
  targetCount: number;
  minDurationSec: number;
  maxDurationSec: number;
  videoDurationSec: number;
  language?: string;
}

export interface GenerateTitleInput {
  transcriptExcerpt: string;
  category: string;
  contentType: string;
  language?: string;
}

export interface GenerateDescriptionInput {
  transcriptExcerpt: string;
  title: string;
  contentType: string;
  language?: string;
}

export interface GenerateHashtagsInput {
  transcriptExcerpt: string;
  category: string;
  contentType: string;
  platform?: string;
  language?: string;
}

export interface GenerateVariantsInput {
  text: string;
  count: number;
  language?: string;
}

export interface GenerateCaptionInput {
  title: string;
  description: string;
  hashtags: string[];
  bioTemplate?: string;
  language?: string;
}

export interface GenerateBioInput {
  contentType: string;
  channelName?: string;
  language?: string;
}

export interface ScoreClipInput {
  transcriptExcerpt: string;
  category: string;
}

// ── The abstraction itself (spec section 34) ─────────────────────────────

export interface AIProvider {
  analyzeTranscript(input: AnalyzeTranscriptInput): Promise<TranscriptAnalysis>;
  findHighlights(input: FindHighlightsInput): Promise<{
    candidates: HighlightCandidate[];
    insufficientMaterialReason: string | null;
  }>;
  generateTitle(input: GenerateTitleInput): Promise<string>;
  generateDescription(input: GenerateDescriptionInput): Promise<string>;
  generateHashtags(input: GenerateHashtagsInput): Promise<string[]>;
  generateVariants(input: GenerateVariantsInput): Promise<TextVariantResult[]>;
  generateCaption(input: GenerateCaptionInput): Promise<string>;
  generateBio(input: GenerateBioInput): Promise<string>;
  scoreClip(input: ScoreClipInput): Promise<{ score: number; reason: string }>;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public provider: "GEMINI" | "CUSTOM",
    public override cause?: unknown,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
