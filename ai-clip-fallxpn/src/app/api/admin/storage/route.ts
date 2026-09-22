import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";

/**
 * Read-only by design: switching STORAGE_PROVIDER at runtime would strand
 * every existing storage key (a local-disk key isn't a valid S3 key and
 * vice versa), so this is a deploy-time decision made via `.env`, not a
 * live toggle. This page exists so an admin can confirm what's active
 * without shelling into the server.
 */
export async function GET() {
  try {
    await requireAdmin();
    const provider = process.env.STORAGE_PROVIDER ?? "local";
    return NextResponse.json({
      provider,
      details:
        provider === "local"
          ? { path: process.env.STORAGE_LOCAL_PATH ?? "./storage" }
          : {
              endpoint: process.env.S3_ENDPOINT || "(default AWS S3 endpoint)",
              region: process.env.S3_REGION,
              bucket: process.env.S3_BUCKET,
              forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
              publicUrlBase: process.env.S3_PUBLIC_URL || null,
            },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Could not load storage config." }, { status: 500 });
  }
}
