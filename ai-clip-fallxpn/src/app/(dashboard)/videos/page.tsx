import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export default async function VideosPage() {
  const user = await getCurrentUser();
  const videos = await prisma.video.findMany({
    where: { userId: user!.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { generations: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Videos</h1>
        <Link href="/create">
          <Button size="sm">
            <Sparkles size={14} /> New
          </Button>
        </Link>
      </div>

      {videos.length === 0 ? (
        <Card className="mt-6 p-10 text-center text-ink-muted">No source videos yet.</Card>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <Card key={v.id} className="overflow-hidden">
              <div className="flex h-32 items-center justify-center bg-base-elevated">
                {v.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-ink-faint">{v.sourceType}</span>
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-medium text-ink">{v.title ?? "Untitled"}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {v.durationSec ? `${Math.floor(v.durationSec / 60)} min` : ""} • {v._count.generations} generation(s)
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
