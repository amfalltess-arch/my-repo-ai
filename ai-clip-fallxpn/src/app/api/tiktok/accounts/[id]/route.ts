import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/security/encryption";
import { revokeToken } from "@/lib/tiktok/oauth";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const account = await prisma.tikTokAccount.findFirst({
      where: { id, userId: user.id },
    });
    if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    await revokeToken(decryptSecret(account.accessTokenEnc));
    await prisma.tikTokAccount.update({
      where: { id: account.id },
      data: { status: "revoked" },
    });
    await prisma.auditLog.create({
      data: { userId: user.id, action: "tiktok_disconnected", metadata: { username: account.username } },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("tiktok disconnect error:", err);
    return NextResponse.json({ error: "Could not disconnect account." }, { status: 500 });
  }
}
