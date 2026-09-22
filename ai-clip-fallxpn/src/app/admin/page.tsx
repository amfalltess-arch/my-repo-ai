import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";

export default async function AdminDashboardPage() {
  const [userCount, videoCount, generationCount, clipCount, publishedCount, failedJobs] =
    await prisma.$transaction([
      prisma.user.count(),
      prisma.video.count(),
      prisma.generation.count(),
      prisma.clip.count({ where: { status: "READY" } }),
      prisma.publishJob.count({ where: { status: "PUBLISHED" } }),
      prisma.processingJob.count({ where: { status: "FAILED" } }),
    ]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-bold text-ink">Admin Dashboard</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Users" value={userCount} />
        <Stat label="Source videos" value={videoCount} />
        <Stat label="Generations" value={generationCount} />
        <Stat label="Clips rendered" value={clipCount} />
        <Stat label="Published to TikTok" value={publishedCount} />
        <Stat label="Failed processing jobs" value={failedJobs} warn={failedJobs > 0} />
      </div>
      <p className="mt-8 text-sm text-ink-muted">
        Use the sidebar to configure AI providers, per-user limits, global templates, generation
        defaults, and to inspect the queue or audit log.
      </p>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <Card className="p-4">
      <p className={`text-2xl font-bold tabular ${warn ? "text-danger" : "text-ink"}`}>{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </Card>
  );
}
