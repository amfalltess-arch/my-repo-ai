import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser, AuthError } from "@/lib/auth/session";
import { buildAuthorizeUrl, TikTokConfigError } from "@/lib/tiktok/oauth";
import { randomToken } from "@/lib/security/encryption";

const STATE_COOKIE = "tiktok_oauth_state";

export async function GET() {
  try {
    await requireUser();

    const state = randomToken(16);
    const cookieStore = await cookies();
    cookieStore.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600, // 10 minutes to complete the OAuth round trip
    });

    return NextResponse.redirect(buildAuthorizeUrl(state));
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL));
    }
    if (err instanceof TikTokConfigError) {
      const url = new URL("/tiktok", process.env.NEXT_PUBLIC_APP_URL);
      url.searchParams.set("error", "TikTok is not configured. Connect TikTok API in Admin Settings.");
      return NextResponse.redirect(url);
    }
    throw err;
  }
}
