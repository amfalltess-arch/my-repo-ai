import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { contentTemplateSchema } from "@/lib/security/validation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const existing = await prisma.contentTemplate.findFirst({
      where: { id, userId: user.id }, // users can only edit their own templates, never global ones
    });
    if (!existing) return NextResponse.json({ error: "Template not found." }, { status: 404 });

    const body = await request.json();
    const parsed = contentTemplateSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const template = await prisma.contentTemplate.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json({ template });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("template update error:", err);
    return NextResponse.json({ error: "Could not update template." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const existing = await prisma.contentTemplate.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) return NextResponse.json({ error: "Template not found." }, { status: 404 });

    await prisma.contentTemplate.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("template delete error:", err);
    return NextResponse.json({ error: "Could not delete template." }, { status: 500 });
  }
}
