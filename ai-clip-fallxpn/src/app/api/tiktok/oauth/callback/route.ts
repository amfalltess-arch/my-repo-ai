import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/security/encryption";
import { exchangeCodeForToken, fetchUserInfo, TikTokApiError } from "@/lib/tiktok/oauth";

const STATE_COOKIE = "tiktok_oauth_state";

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const redirectWithError = (message: string) => {
    const url = new URL("/tiktok", appUrl);
    url.searchParams.set("error", message);
    return NextResponse.redirect(url);
  };

  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      return redirectWithError(
        errorParam === "access_denied" ? "You declined the TikTok connection." : errorParam,
      );
    }

    const cookieStore = await cookies();
    const expectedState = cookieStore.get(STATE_COOKIE)?.value;
    cookieStore.delete(STATE_COOKIE);

    if (!code || !state || !expectedState || state !== expectedState) {
      return redirectWithError("Invalid or expired authorization request. Please try again.");
    }

    const token = await exchangeCodeForToken(code);
    const profile = await fetchUserInfo(token.access_token);

    await prisma.tikTokAccount.upsert({
      where: { userId_tiktokOpenId: { userId: user.id, tiktokOpenId: profile.openId } },
      create: {
        userId: user.id,
        tiktokOpenId: profile.openId,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        accessTokenEnc: encryptSecret(token.access_token),
        refreshTokenEnc: encryptSecret(token.refresh_token),
        scope: token.scope,
        tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
        refreshExpiresAt: new Date(Date.now() + token.refresh_expires_in * 1000),
        status: "connected",
      },
      update: {
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        accessTokenEnc: encryptSecret(token.access_token),
        refreshTokenEnc: encryptSecret(token.refresh_token),
        scope: token.scope,
        tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
        refreshExpiresAt: new Date(Date.now() + token.refresh_expires_in * 1000),
        status: "connected",
      },
    });

    await prisma.auditLog.create({
      data: { userId: user.id, action: "tiktok_connected", metadata: { username: profile.username } },
    });

    return NextResponse.redirect(new URL("/tiktok", appUrl));
  } catch (err) {
    console.error("tiktok oauth callback error:", err);
    if (err instanceof TikTokApiError) {
      return redirectWithError(err.message);
    }
    return redirectWithError("Could not connect your TikTok account. Please try again.");
  }
}
