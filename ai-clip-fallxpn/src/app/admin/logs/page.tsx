"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface LogRow {
  id: string;
  action: string;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
  user: { email: string } | null;
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  async function load(after?: string) {
    const data = await api.get<{ logs: LogRow[]; nextCursor: string | null }>(
      `/admin/logs${after ? `?cursor=${after}` : ""}`,
    );
    setLogs((prev) => (after ? [...prev, ...data.logs] : data.logs));
    setCursor(data.nextCursor);
    setHasMore(Boolean(data.nextCursor));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-ink">Audit Log</h1>
      <div className="mt-6 space-y-1.5">
        {logs.map((log) => (
          <Card key={log.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <span className="font-mono text-ink">{log.action}</span>
              <span className="ml-2 text-ink-faint">{log.user?.email ?? "system"}</span>
            </div>
            <span className="tabular text-xs text-ink-faint">{new Date(log.createdAt).toLocaleString()}</span>
          </Card>
        ))}
      </div>
      {hasMore && (
        <div className="mt-4 text-center">
          <Button variant="secondary" size="sm" onClick={() => cursor && load(cursor)}>Load more</Button>
        </div>
      )}
    </div>
  );
}
