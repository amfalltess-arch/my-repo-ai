import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { refreshAccessToken } from "@/lib/tiktok/oauth";

const REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh if expiring within 5 minutes

/** Returns a live, decrypted access token for a connected TikTok account, refreshing it first if it's about to expire. */
export async function getValidAccessToken(tiktokAccountId: string): Promise<string> {
  const account = await prisma.tikTokAccount.findUniqueOrThrow({
    where: { id: tiktokAccountId },
  });

  const expiresSoon =
    account.tokenExpiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS;

  if (!expiresSoon) {
    return decryptSecret(account.accessTokenEnc);
  }

  const refreshToken = decryptSecret(account.refreshTokenEnc);
  const refreshed = await refreshAccessToken(refreshToken);

  await prisma.tikTokAccount.update({
    where: { id: account.id },
    data: {
      accessTokenEnc: encryptSecret(refreshed.access_token),
      refreshTokenEnc: encryptSecret(refreshed.refresh_token),
      tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      refreshExpiresAt: new Date(Date.now() + refreshed.refresh_expires_in * 1000),
      scope: refreshed.scope,
      status: "connected",
    },
  });

  return refreshed.access_token;
}
