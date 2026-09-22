import { Worker, type Job } from "bullmq";
import archiver from "archiver";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { getStorageDriver, generateStorageKey } from "@/lib/storage/storage";

export interface ZipGenerationJobData {
  processingJobId: string;
  clipIds: string[];
  includeTxt: boolean;
}

/** Spec section 20: `01-video.mp4 ... 40-video.mp4` plus optional `01.txt ... 40.txt` metadata. */
export function startZipGenerationWorker() {
  return new Worker<ZipGenerationJobData>(
    "zip-generation",
    async (job: Job<ZipGenerationJobData>) => {
      await prisma.processingJob.update({
        where: { id: job.data.processingJobId },
        data: { status: "ACTIVE" },
      });

      try {
        const clips = await prisma.clip.findMany({
          where: { id: { in: job.data.clipIds }, status: "READY" },
          include: {
            generation: { include: { contentTemplate: true } },
          },
          orderBy: { index: "asc" },
        });

        const storage = await getStorageDriver();
        const tmpZipPath = path.join(
          os.tmpdir(),
          `ai-clipflow-export-${job.data.processingJobId}.zip`,
        );

        await new Promise<void>((resolve, reject) => {
          const output = fs.createWriteStream(tmpZipPath);
          const archive = archiver("zip", { zlib: { level: 6 } });
          output.on("close", resolve);
          archive.on("error", reject);
          archive.pipe(output);

          (async () => {
            for (const clip of clips) {
              const num = String(clip.index).padStart(2, "0");
              if (clip.renderedStorageKey) {
                const buffer = await storage.get(clip.renderedStorageKey);
                archive.append(buffer, { name: `${num}-video.mp4` });
              }
              if (job.data.includeTxt) {
                const lines = [
                  `Title: ${clip.title ?? ""}`,
                  `Description: ${clip.description ?? ""}`,
                  `Hashtags: ${clip.hashtags.map((h) => `#${h}`).join(" ")}`,
                  `Bio Template: ${clip.generation.contentTemplate?.bio ?? ""}`,
                  `TikTok Status: ${await getTikTokStatusLabel(clip.id)}`,
                ];
                archive.append(lines.join("\n"), { name: `${num}.txt` });
              }
            }
            await archive.finalize();
          })().catch(reject);
        });

        const zipBuffer = await fsp.readFile(tmpZipPath);
        const zipKey = generateStorageKey("exports", "zip");
        await storage.put(zipKey, zipBuffer, "application/zip");
        await fsp.rm(tmpZipPath, { force: true });

        await prisma.processingJob.update({
          where: { id: job.data.processingJobId },
          data: { status: "COMPLETED", progress: 100, result: { zipKey } },
        });

        return { zipKey };
      } catch (err) {
        await prisma.processingJob.update({
          where: { id: job.data.processingJobId },
          data: {
            status: "FAILED",
            error: err instanceof Error ? err.message : String(err),
          },
        });
        throw err;
      }
    },
    { connection: redis, concurrency: 2 },
  );
}

async function getTikTokStatusLabel(clipId: string): Promise<string> {
  const publishJob = await prisma.publishJob.findFirst({
    where: { clipId },
    orderBy: { createdAt: "desc" },
  });
  return publishJob?.status ?? "Not published";
}
