import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const user = await requireUser();
    const accounts = await prisma.tikTokAccount.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      // Never return accessTokenEnc/refreshTokenEnc to the client.
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        status: true,
        lastUsedAt: true,
        tokenExpiresAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ accounts });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("tiktok accounts list error:", err);
    return NextResponse.json({ error: "Could not load TikTok accounts." }, { status: 500 });
  }
}
