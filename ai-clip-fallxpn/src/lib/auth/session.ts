import "server-only";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import { hashToken, randomToken } from "@/lib/security/encryption";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signSessionJwt,
  verifySessionJwt,
} from "@/lib/auth/jwt";
import type { Role, User } from "@prisma/client";

export async function createSession(user: Pick<User, "id" | "role">) {
  const rawToken = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const hdrs = await headers();

  await prisma.session.create({
    data: {
      userId: user.id,
      hashedToken: hashToken(rawToken),
      expiresAt,
      userAgent: hdrs.get("user-agent") ?? undefined,
      ipAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    },
  });

  const jwt = await signSessionJwt({
    sub: user.id,
    role: user.role,
    sid: rawToken,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroyCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const payload = await verifySessionJwt(token);
    if (payload) {
      await prisma.session
        .deleteMany({ where: { hashedToken: hashToken(payload.sid) } })
        .catch(() => undefined);
    }
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

/**
 * Authoritative session check: verifies the JWT signature/expiry AND that
 * the underlying Session row still exists and hasn't expired or been
 * revoked (logout, admin-forced sign-out, etc). Use this in route handlers
 * and server components for anything that gates real data or actions.
 * `middleware.ts` does a cheaper JWT-only check for fast edge redirects.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySessionJwt(token);
  if (!payload) return null;

  const session = await prisma.session.findUnique({
    where: { hashedToken: hashToken(payload.sid) },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  // Best-effort activity heartbeat; failure here should never break auth.
  prisma.session
    .update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    })
    .catch(() => undefined);

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("Not authenticated");
  }
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new AuthError("Admin access required", 403);
  }
  return user;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
