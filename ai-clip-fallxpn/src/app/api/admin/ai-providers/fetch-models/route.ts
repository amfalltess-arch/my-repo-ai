import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/security/encryption";
import { GeminiProvider } from "@/lib/ai/gemini-provider";
import { CustomProvider } from "@/lib/ai/custom-provider";

const fetchSchema = z.object({
  type: z.enum(["GEMINI", "CUSTOM"]),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const parsed = fetchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

    let apiKey = parsed.data.apiKey;
    if (!apiKey) {
      const saved = await prisma.aIProviderConfig.findUnique({ where: { type: parsed.data.type } });
      if (saved?.apiKeyEnc) apiKey = decryptSecret(saved.apiKeyEnc);
    }

    const models =
      parsed.data.type === "GEMINI"
        ? await GeminiProvider.fetchModels({ apiKey: apiKey ?? "", baseUrl: parsed.data.baseUrl })
        : await CustomProvider.fetchModels({ baseUrl: parsed.data.baseUrl ?? "", apiKey });

    return NextResponse.json({ models });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("admin fetch-models error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not fetch models." },
      { status: 500 },
    );
  }
}
