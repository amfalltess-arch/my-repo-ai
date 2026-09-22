import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { registerSchema } from "@/lib/security/validation";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  try {
    await enforceRateLimit({ key: `register:${ip}`, limit: 5, windowSeconds: 3600 });

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        passwordHash,
        name: parsed.data.name,
        // The very first account on a fresh install becomes an admin so
        // there's always a way into /admin without manual DB surgery.
        role: (await prisma.user.count()) === 0 ? "ADMIN" : "USER",
      },
    });

    await createSession(user);
    await prisma.auditLog.create({
      data: { userId: user.id, action: "user_registered", ip },
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429 },
      );
    }
    console.error("register error:", err);
    return NextResponse.json({ error: "Registration failed." }, { status: 500 });
  }
}
