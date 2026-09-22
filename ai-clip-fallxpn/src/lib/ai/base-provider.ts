import { z } from "zod";
import type {
  AIProvider,
  AnalyzeTranscriptInput,
  FindHighlightsInput,
  GenerateBioInput,
  GenerateCaptionInput,
  GenerateDescriptionInput,
  GenerateHashtagsInput,
  GenerateTitleInput,
  GenerateVariantsInput,
  ScoreClipInput,
  TextVariantResult,
  TranscriptAnalysis,
  TranscriptSegment,
} from "@/lib/ai/types";
import {
  bioResultSchema,
  captionResultSchema,
  clipScoreSchema,
  descriptionResultSchema,
  hashtagsResultSchema,
  highlightCandidateListSchema,
  textVariantListSchema,
  titleResultSchema,
  transcriptAnalysisSchema,
} from "@/lib/ai/types";

function formatTranscript(transcript: TranscriptSegment[]): string {
  return transcript
    .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join("\n");
}

/**
 * Everything that is genuinely provider-specific — the HTTP call, auth,
 * request/response envelope, and how JSON-mode is requested — lives in the
 * concrete subclasses (GeminiProvider, CustomProvider). Everything that is
 * *prompt design*, which is provider-agnostic, lives here exactly once so
 * Gemini and a Custom (OpenAI-compatible) model get identical instructions.
 */
export abstract class BaseJsonAIProvider implements AIProvider {
  protected abstract completeJson<T>(params: {
    systemPrompt: string;
    prompt: string;
    schema: z.ZodType<T>;
    temperature?: number;
  }): Promise<T>;

  async analyzeTranscript(
    input: AnalyzeTranscriptInput,
  ): Promise<TranscriptAnalysis> {
    return this.completeJson({
      systemPrompt:
        "You are a video content analyst. Read the transcript and describe " +
        "the video at a high level. Respond only with the requested JSON.",
      prompt: `Transcript (timestamps in seconds):\n${formatTranscript(input.transcript)}`,
      schema: transcriptAnalysisSchema,
    });
  }

  async findHighlights(input: FindHighlightsInput) {
    const overGenerateBy = Math.min(input.targetCount * 2, input.targetCount + 25);
    const result = await this.completeJson({
      systemPrompt:
        "You are an expert short-form video editor who finds the best clip-worthy " +
        "moments in long-form footage for TikTok/Reels/Shorts. For each candidate " +
        "moment, evaluate: hook strength, story/narrative arc, emotional beats, " +
        "reactions, humor, unexpected turns, important information, punchlines, " +
        "question/answer pairs, payoffs, shareability, and retention potential. " +
        "Every candidate MUST have a clear hook near its start and a sensible, " +
        "non-abrupt ending — never cut off mid-sentence or mid-thought. Prefer " +
        "candidates that stand alone without needing outside context. " +
        `Candidates must each be between ${input.minDurationSec} and ${input.maxDurationSec} seconds long. ` +
        "Respond only with the requested JSON.",
      prompt:
        `Content type / category focus: ${input.contentType}\n` +
        `Source video duration: ${input.videoDurationSec.toFixed(0)}s\n` +
        `Find up to ${overGenerateBy} distinct candidate moments (the caller will down-select and ` +
        `de-duplicate afterwards, so it is fine — and preferred — to return more than the ` +
        `final target of ${input.targetCount} if the material supports it). Candidates should be spread ` +
        "across the video and must not substantially overlap each other in time. " +
        `If, and only if, the material genuinely does not contain ${input.targetCount} distinct ` +
        "quality moments, return fewer candidates and fill insufficientMaterialReason " +
        "with a brief, honest explanation. Otherwise leave it null.\n\n" +
        `Transcript (timestamps in seconds):\n${formatTranscript(input.transcript)}`,
      schema: highlightCandidateListSchema,
    });
    return {
      candidates: result.candidates,
      insufficientMaterialReason: result.insufficientMaterialReason,
    };
  }

  async generateTitle(input: GenerateTitleInput): Promise<string> {
    const result = await this.completeJson({
      systemPrompt:
        "You write short, punchy, curiosity-driven titles for vertical short-form " +
        "video clips (TikTok/Reels/Shorts style). Titles must be truthful to the " +
        "clip content — no clickbait that misrepresents what happens. Max ~80 " +
        "characters. Respond only with the requested JSON.",
      prompt:
        `Content type: ${input.contentType}\nMoment category: ${input.category}\n` +
        `Language: ${input.language ?? "match the transcript's language"}\n\n` +
        `Clip transcript excerpt:\n${input.transcriptExcerpt}`,
      schema: titleResultSchema,
    });
    return result.title;
  }

  async generateDescription(
    input: GenerateDescriptionInput,
  ): Promise<string> {
    const result = await this.completeJson({
      systemPrompt:
        "You write short, engaging social video descriptions (2-4 sentences) that " +
        "add context or a hook without simply repeating the title verbatim. " +
        "Respond only with the requested JSON.",
      prompt:
        `Title: ${input.title}\nContent type: ${input.contentType}\n` +
        `Language: ${input.language ?? "match the transcript's language"}\n\n` +
        `Clip transcript excerpt:\n${input.transcriptExcerpt}`,
      schema: descriptionResultSchema,
    });
    return result.description;
  }

  async generateHashtags(input: GenerateHashtagsInput): Promise<string[]> {
    const result = await this.completeJson({
      systemPrompt:
        "You generate relevant social video hashtags (without the # symbol) based " +
        "on content, category, topic, and platform. Mix broad discovery tags with " +
        "a few specific/niche tags. Never claim or imply hashtags will make a " +
        "video go viral. Respond only with the requested JSON.",
      prompt:
        `Content type: ${input.contentType}\nMoment category: ${input.category}\n` +
        `Platform: ${input.platform ?? "TikTok"}\n` +
        `Language: ${input.language ?? "match the transcript's language"}\n\n` +
        `Clip transcript excerpt:\n${input.transcriptExcerpt}`,
      schema: hashtagsResultSchema,
    });
    return result.hashtags.map((h) => h.replace(/^#/, ""));
  }

  async generateVariants(
    input: GenerateVariantsInput,
  ): Promise<TextVariantResult[]> {
    const result = await this.completeJson({
      systemPrompt:
        "You rewrite short marketing/social copy into distinct alternative " +
        "phrasings that preserve the original meaning. Each variant must read " +
        "naturally and be genuinely different in wording/structure from the " +
        "others, not a trivial synonym swap. Respond only with the requested JSON.",
      prompt:
        `Produce exactly ${input.count} variants, labeled A, B, C, ... in order.\n` +
        `Language: ${input.language ?? "match the input text's language"}\n\n` +
        `Original text:\n${input.text}`,
      schema: textVariantListSchema,
    });
    return result.variants;
  }

  async generateCaption(input: GenerateCaptionInput): Promise<string> {
    const result = await this.completeJson({
      systemPrompt:
        "You write a single ready-to-post social video caption that naturally " +
        "weaves together a title, description, and hashtags. If a bio/CTA " +
        "template is provided, incorporate its intent naturally rather than " +
        "pasting it verbatim if that would read awkwardly. Respond only with the requested JSON.",
      prompt:
        `Title: ${input.title}\nDescription: ${input.description}\n` +
        `Hashtags: ${input.hashtags.map((h) => `#${h}`).join(" ")}\n` +
        (input.bioTemplate ? `Bio/CTA template: ${input.bioTemplate}\n` : "") +
        `Language: ${input.language ?? "match the description's language"}`,
      schema: captionResultSchema,
    });
    return result.caption;
  }

  async generateBio(input: GenerateBioInput): Promise<string> {
    const result = await this.completeJson({
      systemPrompt:
        "You draft a short, reusable creator bio/caption template with a " +
        "follow call-to-action, suitable for appending to every clip from a " +
        "channel. Keep it under ~4 lines. Respond only with the requested JSON.",
      prompt:
        `Content type: ${input.contentType}\n` +
        (input.channelName ? `Channel name: ${input.channelName}\n` : "") +
        `Language: ${input.language ?? "Indonesian"}`,
      schema: bioResultSchema,
    });
    return result.bio;
  }

  async scoreClip(
    input: ScoreClipInput,
  ): Promise<{ score: number; reason: string }> {
    return this.completeJson({
      systemPrompt:
        "You score how likely a short video clip is to perform well on " +
        "TikTok/Reels/Shorts (0-100), considering hook strength, pacing, " +
        "clarity, and shareability. Respond only with the requested JSON.",
      prompt: `Moment category: ${input.category}\n\nTranscript excerpt:\n${input.transcriptExcerpt}`,
      schema: clipScoreSchema,
    });
  }
}
