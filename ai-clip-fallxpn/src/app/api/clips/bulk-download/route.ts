import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { zipGenerationQueue } from "@/lib/queue/queues";
import { getStorageDriver } from "@/lib/storage/storage";

const bulkDownloadSchema = z.object({
  clipIds: z.array(z.string().cuid()).min(1).max(40),
  includeTxt: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = bulkDownloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    // Ownership check: every requested clip must belong to a generation the caller owns.
    const owned = await prisma.clip.count({
      where: { id: { in: parsed.data.clipIds }, generation: { userId: user.id } },
    });
    if (owned !== parsed.data.clipIds.length) {
      return NextResponse.json({ error: "One or more clips were not found." }, { status: 404 });
    }

    const processingJob = await prisma.processingJob.create({
      data: { type: "ZIP_GENERATION", status: "PENDING" },
    });

    await zipGenerationQueue.add("zip", {
      processingJobId: processingJob.id,
      clipIds: parsed.data.clipIds,
      includeTxt: parsed.data.includeTxt,
    });

    return NextResponse.json({ jobId: processingJob.id });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("bulk-download create error:", err);
    return NextResponse.json({ error: "Could not start export." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    await requireUser();
    const jobId = new URL(request.url).searchParams.get("jobId");
    if (!jobId) return NextResponse.json({ error: "jobId is required." }, { status: 400 });

    const job = await prisma.processingJob.findUnique({ where: { id: jobId } });
    if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

    if (job.status !== "COMPLETED") {
      return NextResponse.json({ status: job.status, error: job.error ?? undefined });
    }

    const zipKey = (job.result as { zipKey: string } | null)?.zipKey;
    if (!zipKey) return NextResponse.json({ error: "Export completed but no file was recorded." }, { status: 500 });

    const storage = await getStorageDriver();
    const downloadUrl = await storage.getPublicUrl(zipKey, 3600);
    return NextResponse.json({ status: "COMPLETED", downloadUrl });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("bulk-download poll error:", err);
    return NextResponse.json({ error: "Could not check export status." }, { status: 500 });
  }
}
