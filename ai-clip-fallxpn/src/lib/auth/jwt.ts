import { SignJWT, jwtVerify } from "jose";

/**
 * Deliberately has zero imports from `@/lib/db` or anything Node-only, so
 * this file is safe to bundle into `middleware.ts`, which runs on the Edge
 * runtime. The authoritative, revocation-aware session check (which does hit
 * the database) lives in `src/lib/auth/session.ts` and runs in route
 * handlers / server components (Node runtime) instead.
 */

export interface SessionTokenPayload {
  sub: string; // user id
  role: "USER" | "ADMIN";
  sid: string; // raw session token; hash it before looking up the DB row
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a random string of at least 32 characters.",
    );
  }
  return new TextEncoder().encode(secret);
}

export const SESSION_COOKIE_NAME = "acf_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function signSessionJwt(
  payload: SessionTokenPayload,
): Promise<string> {
  return new SignJWT({ role: payload.role, sid: payload.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

/** Verifies signature + expiry only. Does NOT check DB revocation. */
export async function verifySessionJwt(
  token: string,
): Promise<SessionTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      (payload.role !== "USER" && payload.role !== "ADMIN")
    ) {
      return null;
    }
    return { sub: payload.sub, sid: payload.sid, role: payload.role };
  } catch {
    return null;
  }
}
