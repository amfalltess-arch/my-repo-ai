import "server-only";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/security/encryption";
import { GeminiProvider } from "@/lib/ai/gemini-provider";
import { CustomProvider } from "@/lib/ai/custom-provider";
import type { AIProvider } from "@/lib/ai/types";
import { AIProviderError } from "@/lib/ai/types";

/**
 * Resolves which AI provider to use. Checks the database first
 * (`AIProviderConfig`, managed by the Admin Panel in Phase 2 — API keys
 * stored encrypted via `encryptSecret`) and falls back to environment
 * variables so the pipeline works standalone before that UI exists.
 */
export async function getAIProvider(): Promise<AIProvider> {
  const dbConfig = await prisma.aIProviderConfig
    .findFirst({ where: { enabled: true } })
    .catch(() => null); // table may not exist yet on a fresh DB before migration

  if (dbConfig?.type === "GEMINI") {
    return new GeminiProvider({
      apiKey: dbConfig.apiKeyEnc ? decryptSecret(dbConfig.apiKeyEnc) : "",
      baseUrl: dbConfig.baseUrl ?? undefined,
      model: dbConfig.model ?? undefined,
      temperature: dbConfig.temperature,
      maxTokens: dbConfig.maxTokens,
      timeoutMs: dbConfig.timeoutMs,
    });
  }

  if (dbConfig?.type === "CUSTOM") {
    return new CustomProvider({
      baseUrl: dbConfig.baseUrl ?? "",
      apiKey: dbConfig.apiKeyEnc ? decryptSecret(dbConfig.apiKeyEnc) : undefined,
      model: dbConfig.model ?? "",
      temperature: dbConfig.temperature,
      maxTokens: dbConfig.maxTokens,
      timeoutMs: dbConfig.timeoutMs,
      customHeaders: (dbConfig.customHeaders as Record<string, string>) ?? undefined,
    });
  }

  // No enabled row in the DB yet — fall back to environment configuration.
  const activeProvider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();

  if (activeProvider === "custom") {
    return new CustomProvider({
      baseUrl: process.env.CUSTOM_AI_BASE_URL ?? "",
      apiKey: process.env.CUSTOM_AI_API_KEY,
      model: process.env.CUSTOM_AI_MODEL ?? "",
      temperature: process.env.CUSTOM_AI_TEMPERATURE
        ? Number(process.env.CUSTOM_AI_TEMPERATURE)
        : undefined,
      maxTokens: process.env.CUSTOM_AI_MAX_TOKENS
        ? Number(process.env.CUSTOM_AI_MAX_TOKENS)
        : undefined,
      timeoutMs: process.env.CUSTOM_AI_TIMEOUT_MS
        ? Number(process.env.CUSTOM_AI_TIMEOUT_MS)
        : undefined,
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new AIProviderError(
      "No AI provider is configured. Set GEMINI_API_KEY (or AI_PROVIDER=custom " +
        "with CUSTOM_AI_* variables) in your environment.",
      "GEMINI",
    );
  }

  return new GeminiProvider({
    apiKey: process.env.GEMINI_API_KEY,
    baseUrl: process.env.GEMINI_BASE_URL,
    model: process.env.GEMINI_MODEL,
    temperature: process.env.GEMINI_TEMPERATURE
      ? Number(process.env.GEMINI_TEMPERATURE)
      : undefined,
    maxTokens: process.env.GEMINI_MAX_TOKENS
      ? Number(process.env.GEMINI_MAX_TOKENS)
      : undefined,
    timeoutMs: process.env.GEMINI_TIMEOUT_MS
      ? Number(process.env.GEMINI_TIMEOUT_MS)
      : undefined,
  });
}

export * from "@/lib/ai/types";
