"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui/card";

interface QueueStat {
  name: string;
  counts: { waiting: number; active: number; completed: number; failed: number; delayed: number };
}

export default function AdminQueuePage() {
  const [queues, setQueues] = useState<QueueStat[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.get<{ queues: QueueStat[] }>("/admin/queue");
      setQueues(data.queues);
    } catch {
      setError("Could not reach Redis to read queue status.");
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-ink">Queue</h1>
      <p className="mt-1 text-sm text-ink-muted">Live BullMQ job counts — refreshes every 5s.</p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {queues.map((q) => (
          <Card key={q.name} className="p-4">
            <p className="font-mono text-sm font-medium text-ink">{q.name}</p>
            <div className="mt-2 grid grid-cols-5 gap-2 text-center text-xs">
              <Metric label="Wait" value={q.counts.waiting} />
              <Metric label="Active" value={q.counts.active} tone="text-signal" />
              <Metric label="Done" value={q.counts.completed} />
              <Metric label="Failed" value={q.counts.failed} tone={q.counts.failed > 0 ? "text-danger" : undefined} />
              <Metric label="Delayed" value={q.counts.delayed} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className={`tabular text-base font-bold ${tone ?? "text-ink"}`}>{value}</p>
      <p className="text-ink-faint">{label}</p>
    </div>
  );
}
