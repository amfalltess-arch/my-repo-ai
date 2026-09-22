import { z } from "zod";
import { BaseJsonAIProvider } from "@/lib/ai/base-provider";
import { zodToGeminiSchema } from "@/lib/ai/gemini-schema";
import { AIProviderError } from "@/lib/ai/types";

export interface GeminiProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * Gemini Developer API client (generativelanguage.googleapis.com), using
 * `generationConfig.responseMimeType: "application/json"` +
 * `responseSchema` for structured output. See
 * https://ai.google.dev/gemini-api/docs/structured-output — check that page
 * for the current model catalog before deploying, since model names are
 * periodically renamed/retired.
 */
export class GeminiProvider extends BaseJsonAIProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly defaultTemperature: number;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;

  constructor(config: GeminiProviderConfig) {
    super();
    if (!config.apiKey) {
      throw new AIProviderError(
        "Gemini API key is not configured. Set GEMINI_API_KEY or configure it " +
          "in Admin > AI Providers.",
        "GEMINI",
      );
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
    this.model = config.model ?? "gemini-flash-latest";
    this.defaultTemperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 8192;
    this.timeoutMs = config.timeoutMs ?? 60000;
  }

  protected async completeJson<T>(params: {
    systemPrompt: string;
    prompt: string;
    schema: z.ZodType<T>;
    temperature?: number;
  }): Promise<T> {
    const url = `${this.baseUrl}/v1beta/models/${this.model}:generateContent`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: params.systemPrompt }],
          },
          contents: [{ role: "user", parts: [{ text: params.prompt }] }],
          generationConfig: {
            temperature: params.temperature ?? this.defaultTemperature,
            maxOutputTokens: this.maxTokens,
            responseMimeType: "application/json",
            responseSchema: zodToGeminiSchema(params.schema),
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new AIProviderError(
          `Gemini API returned ${response.status}: ${body.slice(0, 500)}`,
          "GEMINI",
        );
      }

      const data = await response.json();
      const text: string | undefined =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (data?.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        throw new AIProviderError(
          "Gemini response was truncated (MAX_TOKENS). Increase GEMINI_MAX_TOKENS.",
          "GEMINI",
        );
      }
      if (!text) {
        throw new AIProviderError(
          "Gemini response contained no text/JSON payload.",
          "GEMINI",
          data,
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new AIProviderError(
          "Gemini response was not valid JSON despite JSON mode.",
          "GEMINI",
          err,
        );
      }

      const result = params.schema.safeParse(parsed);
      if (!result.success) {
        throw new AIProviderError(
          `Gemini JSON did not match the expected schema: ${result.error.message}`,
          "GEMINI",
          result.error,
        );
      }
      return result.data;
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new AIProviderError(
          `Gemini request timed out after ${this.timeoutMs}ms.`,
          "GEMINI",
          err,
        );
      }
      throw new AIProviderError(
        `Gemini request failed: ${err instanceof Error ? err.message : String(err)}`,
        "GEMINI",
        err,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Used by Admin > AI Providers > "Test Connection" (Phase 2 UI). */
  static async testConnection(config: GeminiProviderConfig): Promise<{
    ok: boolean;
    message: string;
  }> {
    try {
      const provider = new GeminiProvider(config);
      await provider.completeJson({
        systemPrompt: "Respond only with the requested JSON.",
        prompt: "Say hello.",
        schema: z.object({ message: z.string() }),
      });
      return { ok: true, message: "Connected successfully." };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Used by Admin > AI Providers > "Fetch Models" (Phase 2 UI). */
  static async fetchModels(config: {
    apiKey: string;
    baseUrl?: string;
  }): Promise<string[]> {
    const baseUrl = (config.baseUrl ?? "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/v1beta/models`, {
      headers: { "x-goog-api-key": config.apiKey },
    });
    if (!response.ok) {
      throw new AIProviderError(
        `Could not list Gemini models (${response.status}).`,
        "GEMINI",
      );
    }
    const data = await response.json();
    return (data.models ?? [])
      .map((m: { name: string }) => m.name.replace(/^models\//, ""))
      .filter((name: string) => name.includes("gemini"));
  }
}
