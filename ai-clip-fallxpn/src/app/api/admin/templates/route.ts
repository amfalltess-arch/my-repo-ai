import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { contentTemplateSchema } from "@/lib/security/validation";

export async function GET() {
  try {
    await requireAdmin();
    const templates = await prisma.contentTemplate.findMany({
      where: { isGlobal: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ templates });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("admin templates list error:", err);
    return NextResponse.json({ error: "Could not load templates." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const parsed = contentTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }
    const template = await prisma.contentTemplate.create({
      data: { ...parsed.data, isGlobal: true, userId: null },
    });
    return NextResponse.json({ template });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("admin template create error:", err);
    return NextResponse.json({ error: "Could not create template." }, { status: 500 });
  }
}
