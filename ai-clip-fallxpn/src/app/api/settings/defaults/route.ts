import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getGenerationDefaults } from "@/lib/settings/generation-defaults";

export async function GET() {
  try {
    await requireUser();
    const defaults = await getGenerationDefaults();
    return NextResponse.json({ defaults });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("settings defaults error:", err);
    return NextResponse.json({ error: "Could not load defaults." }, { status: 500 });
  }
}
