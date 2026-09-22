import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { loginSchema } from "@/lib/security/validation";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  try {
    const limit = Number(process.env.RATE_LIMIT_LOGIN_PER_MINUTE ?? 10);
    await enforceRateLimit({ key: `login:${ip}`, limit, windowSeconds: 60 });

    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });

    // Constant-shape response whether the email exists or not, to avoid
    // leaking account existence via response differences.
    const valid =
      user && (await verifyPassword(parsed.data.password, user.passwordHash));

    if (!user || !valid) {
      await prisma.auditLog
        .create({ data: { action: "login_failed", ip, metadata: { email: parsed.data.email } } })
        .catch(() => undefined);
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await createSession(user);
    await prisma.auditLog.create({
      data: { userId: user.id, action: "login_succeeded", ip },
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429 },
      );
    }
    console.error("login error:", err);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
