import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const cursor = new URL(request.url).searchParams.get("cursor");

    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { user: { select: { email: true } } },
    });

    return NextResponse.json({
      logs,
      nextCursor: logs.length === 50 ? logs[logs.length - 1]?.id : null,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("admin logs error:", err);
    return NextResponse.json({ error: "Could not load logs." }, { status: 500 });
  }
}
