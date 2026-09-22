import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/security/encryption";

const providerConfigSchema = z.object({
  type: z.enum(["GEMINI", "CUSTOM"]),
  name: z.string().min(1).max(100),
  baseUrl: z.string().url().optional().or(z.literal("")),
  apiKey: z.string().optional(), // plaintext in the request; encrypted before storage. Empty = "don't change".
  model: z.string().max(200).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(1_000_000).optional(),
  timeoutMs: z.number().int().min(1000).max(600_000).optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().optional(),
});

/** GET never returns the decrypted key — only whether one is set. */
export async function GET() {
  try {
    await requireAdmin();
    const configs = await prisma.aIProviderConfig.findMany();
    return NextResponse.json({
      configs: configs.map((c) => ({
        ...c,
        apiKeyEnc: undefined,
        hasApiKey: Boolean(c.apiKeyEnc),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("admin ai-providers list error:", err);
    return NextResponse.json({ error: "Could not load AI provider settings." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const parsed = providerConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }
    const { apiKey, ...rest } = parsed.data;

    // Enabling one provider disables the other — getAIProvider() picks
    // whichever row has enabled: true, so exactly one should ever be on.
    if (rest.enabled) {
      await prisma.aIProviderConfig.updateMany({
        where: { type: { not: rest.type } },
        data: { enabled: false },
      });
    }

    const config = await prisma.aIProviderConfig.upsert({
      where: { type: rest.type },
      create: {
        type: rest.type,
        name: rest.name,
        baseUrl: rest.baseUrl || null,
        model: rest.model,
        temperature: rest.temperature ?? 0.7,
        maxTokens: rest.maxTokens ?? 8192,
        timeoutMs: rest.timeoutMs ?? 60000,
        customHeaders: rest.customHeaders,
        enabled: rest.enabled ?? false,
        apiKeyEnc: apiKey ? encryptSecret(apiKey) : null,
      },
      update: {
        name: rest.name,
        baseUrl: rest.baseUrl || null,
        model: rest.model,
        temperature: rest.temperature,
        maxTokens: rest.maxTokens,
        timeoutMs: rest.timeoutMs,
        customHeaders: rest.customHeaders,
        enabled: rest.enabled,
        ...(apiKey ? { apiKeyEnc: encryptSecret(apiKey) } : {}),
      },
    });

    await prisma.auditLog.create({
      data: { userId: admin.id, action: "ai_provider_updated", metadata: { type: rest.type } },
    });

    return NextResponse.json({ config: { ...config, apiKeyEnc: undefined, hasApiKey: Boolean(config.apiKeyEnc) } });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("admin ai-providers update error:", err);
    return NextResponse.json({ error: "Could not save AI provider settings." }, { status: 500 });
  }
}
