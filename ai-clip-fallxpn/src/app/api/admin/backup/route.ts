import { NextResponse } from "next/server";
import { isServerless } from "@/lib/runtime";
import { spawn } from "node:child_process";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getStorageDriver, generateStorageKey } from "@/lib/storage/storage";

/**
 * Spec section 53: "Backup Database", "Backup Configuration", "Download
 * Backup" — "API keys must remain encrypted." The config backup below
 * exports `AIProviderConfig` rows with `apiKeyEnc` still in its encrypted
 * form (never decrypted), so the backup file is safe to store but useless
 * without the server's own `ENCRYPTION_KEY`.
 */
export async function POST() {
  try {
    const admin = await requireAdmin();

    // pg_dump is not installed in Vercel's runtime, so a database dump cannot be
    // produced from a serverless function. Use the database provider's own
    // backups (Neon/Supabase/Vercel Postgres) or run pg_dump from the worker host.
    if (isServerless()) {
      return NextResponse.json(
        {
          error:
            "Database backup is not available on serverless hosting (pg_dump is not installed). " +
            "Use your database provider's built-in backups, or run pg_dump from the worker host.",
        },
        { status: 501 },
      );
    }
    const storage = await getStorageDriver();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("DATABASE_URL is not set.");

    const dump = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const child = spawn("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", dbUrl]);
      child.stdout.on("data", (c) => chunks.push(c));
      let stderr = "";
      child.stderr.on("data", (c) => (stderr += c.toString()));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) reject(new Error(`pg_dump exited with code ${code}: ${stderr.slice(0, 500)}`));
        else resolve(Buffer.concat(chunks));
      });
    });

    const configExport = {
      exportedAt: new Date().toISOString(),
      systemSettings: await prisma.systemSetting.findMany(),
      aiProviderConfigs: await prisma.aIProviderConfig.findMany(), // apiKeyEnc stays encrypted
      globalTemplates: await prisma.contentTemplate.findMany({ where: { isGlobal: true } }),
    };

    const dbKey = generateStorageKey("backups/db", `${timestamp}.dump`);
    const configKey = generateStorageKey("backups/config", `${timestamp}.json`);
    await storage.put(dbKey, dump, "application/octet-stream");
    await storage.put(configKey, Buffer.from(JSON.stringify(configExport, null, 2)), "application/json");

    await prisma.auditLog.create({
      data: { userId: admin.id, action: "backup_created", metadata: { dbKey, configKey } },
    });

    return NextResponse.json({
      dbUrl: await storage.getPublicUrl(dbKey, 3600),
      configUrl: await storage.getPublicUrl(configKey, 3600),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("backup error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error && err.message.includes("ENOENT")
            ? "pg_dump is not installed on this server. Install postgresql-client."
            : err instanceof Error
              ? err.message
              : "Backup failed.",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    await requireAdmin();
    const logs = await prisma.auditLog.findMany({
      where: { action: "backup_created" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ backups: logs });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Could not list backups." }, { status: 500 });
  }
}
