import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionJwt } from "@/lib/auth/jwt";

const PUBLIC_PATHS = ["/login", "/register"];
const PUBLIC_API_PREFIXES = ["/api/auth/login", "/api/auth/register"];

/**
 * Edge-runtime gate. Kept as `middleware.ts` (Next 16 only prints a deprecation
 * notice) because Vercel and Netlify both run it on their edge, which is the most
 * portable option. This intentionally only verifies the JWT's signature
 * and expiry (see `src/lib/auth/jwt.ts`) — it does NOT check whether the
 * underlying Session row was revoked, because Prisma/Postgres isn't
 * available on the Edge runtime. Route handlers and server components
 * call `requireUser()` / `requireAdmin()` from `src/lib/auth/session.ts` for
 * the authoritative, DB-backed check. Treat this middleware as a fast
 * "obviously not logged in" filter, not the final word on authorization.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifySessionJwt(token) : null;

  const isApi = pathname.startsWith("/api");

  if (!payload) {
    if (isApi) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (payload.role !== "ADMIN") {
      if (isApi) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match everything except static files and Next internals so the
     * allowlist above stays the single source of truth for public routes.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
