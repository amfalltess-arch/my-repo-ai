/**
 * Official TikTok OAuth 2.0 (Login Kit). No password/cookie/session
 * scraping, no browser automation, no unofficial endpoints — exactly the
 * spec's requirement (section 22).
 *
 * Endpoints per https://developers.tiktok.com/doc/oauth-user-access-token-management:
 *   Authorize: https://www.tiktok.com/v2/auth/authorize/
 *   Token:     https://open.tiktokapis.com/v2/oauth/token/
 *   Revoke:    https://open.tiktokapis.com/v2/oauth/revoke/
 *
 * Required scopes for this app: user.info.basic, video.upload, video.publish.
 * Register these at https://developers.tiktok.com under your app's
 * "Login Kit" and "Content Posting API" products.
 *
 * NOTE: TikTok rejects redirect URIs on localhost/127.0.0.1/*.local — use a
 * tunnel (Cloudflare Tunnel, ngrok, etc.) for local development.
 */

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";
const USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";

export const TIKTOK_SCOPES = ["user.info.basic", "video.upload", "video.publish"];

function getClientCredentials() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;
  if (!clientKey || !clientSecret || !redirectUri) {
    throw new TikTokConfigError(
      "TikTok is not configured. Set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, " +
        "and TIKTOK_REDIRECT_URI (spec section 55: " +
        '"Connect TikTok API in Admin Settings.").',
    );
  }
  return { clientKey, clientSecret, redirectUri };
}

export function isTikTokConfigured(): boolean {
  try {
    getClientCredentials();
    return true;
  } catch {
    return false;
  }
}

export function buildAuthorizeUrl(state: string): string {
  const { clientKey, redirectUri } = getClientCredentials();
  const params = new URLSearchParams({
    client_key: clientKey,
    scope: TIKTOK_SCOPES.join(","),
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface TikTokTokenResponse {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForToken(
  code: string,
): Promise<TikTokTokenResponse> {
  const { clientKey, clientSecret, redirectUri } = getClientCredentials();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new TikTokApiError(
      `TikTok token exchange failed: ${data.error_description ?? data.error ?? response.status}`,
    );
  }
  return data as TikTokTokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<TikTokTokenResponse> {
  const { clientKey, clientSecret } = getClientCredentials();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new TikTokApiError(
      `TikTok token refresh failed: ${data.error_description ?? data.error ?? response.status}`,
    );
  }
  return data as TikTokTokenResponse;
}

export async function revokeToken(accessToken: string): Promise<void> {
  const { clientKey, clientSecret } = getClientCredentials();
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      token: accessToken,
    }),
  }).catch(() => undefined); // best-effort; we remove the local record regardless
}

export async function fetchUserInfo(accessToken: string): Promise<{
  openId: string;
  username: string;
  avatarUrl: string;
}> {
  const params = new URLSearchParams({
    fields: "open_id,username,avatar_url",
  });
  const response = await fetch(`${USER_INFO_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json();
  if (!response.ok || data.error?.code !== "ok") {
    throw new TikTokApiError(
      `TikTok user info request failed: ${data.error?.message ?? response.status}`,
    );
  }
  return {
    openId: data.data.user.open_id,
    username: data.data.user.username,
    avatarUrl: data.data.user.avatar_url,
  };
}

export class TikTokConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TikTokConfigError";
  }
}

export class TikTokApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TikTokApiError";
  }
}
