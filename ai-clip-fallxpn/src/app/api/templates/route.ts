import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { contentTemplateSchema } from "@/lib/security/validation";

export async function GET() {
  try {
    const user = await requireUser();
    // The user's own templates plus every admin-created global template
    // (spec section 32) are both selectable from the Create page.
    const templates = await prisma.contentTemplate.findMany({
      where: { OR: [{ userId: user.id }, { isGlobal: true }] },
      orderBy: [{ isGlobal: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ templates });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("templates list error:", err);
    return NextResponse.json({ error: "Could not load templates." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = contentTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const template = await prisma.contentTemplate.create({
      data: { ...parsed.data, userId: user.id, isGlobal: false },
    });
    return NextResponse.json({ template });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("template create error:", err);
    return NextResponse.json({ error: "Could not create template." }, { status: 500 });
  }
}
