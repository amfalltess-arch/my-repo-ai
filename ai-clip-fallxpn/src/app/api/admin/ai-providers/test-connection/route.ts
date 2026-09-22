import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/security/encryption";
import { GeminiProvider } from "@/lib/ai/gemini-provider";
import { CustomProvider } from "@/lib/ai/custom-provider";

const testSchema = z.object({
  type: z.enum(["GEMINI", "CUSTOM"]),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(), // if omitted, falls back to the already-saved (encrypted) key
  model: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const parsed = testSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    let apiKey = parsed.data.apiKey;
    if (!apiKey) {
      const saved = await prisma.aIProviderConfig.findUnique({ where: { type: parsed.data.type } });
      if (saved?.apiKeyEnc) apiKey = decryptSecret(saved.apiKeyEnc);
    }

    const result =
      parsed.data.type === "GEMINI"
        ? await GeminiProvider.testConnection({
            apiKey: apiKey ?? "",
            baseUrl: parsed.data.baseUrl,
            model: parsed.data.model,
          })
        : await CustomProvider.testConnection({
            baseUrl: parsed.data.baseUrl ?? "",
            apiKey,
            model: parsed.data.model ?? "",
          });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("admin test-connection error:", err);
    return NextResponse.json({ ok: false, message: "Unexpected error while testing the connection." });
  }
}
