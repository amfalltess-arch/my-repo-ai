import { z } from "zod";
import { BaseJsonAIProvider } from "@/lib/ai/base-provider";
import { zodToJsonSchema } from "@/lib/ai/json-schema";
import { AIProviderError } from "@/lib/ai/types";

export interface CustomProviderConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  customHeaders?: Record<string, string>;
}

/**
 * Generic client for any OpenAI-Chat-Completions-compatible endpoint
 * (self-hosted vLLM/Ollama/llama.cpp server, OpenRouter, Groq, Together,
 * a company's internal gateway, etc). This is deliberately the lowest
 * common denominator: `POST {baseUrl}/chat/completions` with
 * `response_format: { type: "json_object" }`. Not every backend supports
 * strict JSON-schema enforcement, so the target shape is also spelled out
 * in the prompt itself, and the response is always re-validated with Zod
 * regardless of what the server claims to have done.
 */
export class CustomProvider extends BaseJsonAIProvider {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly defaultTemperature: number;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private readonly customHeaders: Record<string, string>;

  constructor(config: CustomProviderConfig) {
    super();
    if (!config.baseUrl) {
      throw new AIProviderError(
        "Custom AI base URL is not configured. Set CUSTOM_AI_BASE_URL or " +
          "configure it in Admin > AI Providers.",
        "CUSTOM",
      );
    }
    if (!config.model) {
      throw new AIProviderError(
        "Custom AI model is not configured.",
        "CUSTOM",
      );
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.defaultTemperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 8192;
    this.timeoutMs = config.timeoutMs ?? 60000;
    this.customHeaders = config.customHeaders ?? {};
  }

  protected async completeJson<T>(params: {
    systemPrompt: string;
    prompt: string;
    schema: z.ZodType<T>;
    temperature?: number;
  }): Promise<T> {
    const jsonSchema = zodToJsonSchema(params.schema);
    const url = `${this.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          ...this.customHeaders,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: params.temperature ?? this.defaultTemperature,
          max_tokens: this.maxTokens,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                `${params.systemPrompt}\n\n` +
                "Respond with a single JSON object and nothing else (no markdown " +
                "fences, no commentary) that strictly matches this JSON Schema:\n" +
                JSON.stringify(jsonSchema),
            },
            { role: "user", content: params.prompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new AIProviderError(
          `Custom AI provider returned ${response.status}: ${body.slice(0, 500)}`,
          "CUSTOM",
        );
      }

      const data = await response.json();
      const content: string | undefined = data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new AIProviderError(
          "Custom AI provider response contained no message content.",
          "CUSTOM",
          data,
        );
      }

      const jsonText = extractJson(content);
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch (err) {
        throw new AIProviderError(
          "Custom AI provider did not return valid JSON.",
          "CUSTOM",
          err,
        );
      }

      const result = params.schema.safeParse(parsed);
      if (!result.success) {
        throw new AIProviderError(
          `Custom AI provider JSON did not match the expected schema: ${result.error.message}`,
          "CUSTOM",
          result.error,
        );
      }
      return result.data;
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new AIProviderError(
          `Custom AI provider request timed out after ${this.timeoutMs}ms.`,
          "CUSTOM",
          err,
        );
      }
      throw new AIProviderError(
        `Custom AI provider request failed: ${err instanceof Error ? err.message : String(err)}`,
        "CUSTOM",
        err,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  static async testConnection(config: CustomProviderConfig): Promise<{
    ok: boolean;
    message: string;
  }> {
    try {
      const provider = new CustomProvider(config);
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

  /** Used by Admin > AI Providers > "Fetch Models" (Phase 2 UI). Optional: not every OpenAI-compatible server exposes GET /models. */
  static async fetchModels(config: {
    baseUrl: string;
    apiKey?: string;
  }): Promise<string[]> {
    const baseUrl = config.baseUrl.replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/models`, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
    });
    if (!response.ok) {
      throw new AIProviderError(
        `Could not list models from custom provider (${response.status}).`,
        "CUSTOM",
      );
    }
    const data = await response.json();
    return (data.data ?? []).map((m: { id: string }) => m.id);
  }
}

/** Strips markdown code fences some models add even when told not to. */
function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? content).trim();
}
