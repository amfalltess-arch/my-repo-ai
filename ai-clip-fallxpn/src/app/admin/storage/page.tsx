"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card, Badge } from "@/components/ui/card";

export default function AdminStoragePage() {
  const [data, setData] = useState<{ provider: string; details: Record<string, unknown> } | null>(null);

  useEffect(() => {
    api.get<{ provider: string; details: Record<string, unknown> }>("/admin/storage").then(setData);
  }, []);

  if (!data) return <p className="text-ink-muted">Loading...</p>;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-2xl font-bold text-ink">Storage</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Set via <code className="rounded bg-base-elevated px-1">STORAGE_PROVIDER</code> in your environment —
        changing this live would strand existing files, so it's a deploy-time setting, not a toggle here.
      </p>

      <Card className="mt-6 p-5">
        <div className="flex items-center gap-2">
          <Badge tone="signal">{data.provider.toUpperCase()}</Badge>
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          {Object.entries(data.details).map(([key, value]) => (
            <div key={key} className="flex justify-between border-b border-base-border/50 pb-1.5">
              <dt className="text-ink-muted">{key}</dt>
              <dd className="font-mono text-ink">{String(value ?? "—")}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
