"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatabaseBackup, Download } from "lucide-react";

interface BackupLog {
  id: string;
  createdAt: string;
  metadata: { dbKey: string; configKey: string } | null;
}

export default function AdminBackupPage() {
  const [backups, setBackups] = useState<BackupLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ dbUrl: string; configUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await api.get<{ backups: BackupLog[] }>("/admin/backup");
    setBackups(data.backups);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleBackup() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post<{ dbUrl: string; configUrl: string }>("/admin/backup");
      setResult(data);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Backup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-2xl font-bold text-ink">Backup</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Dumps the full database (via <code className="rounded bg-base-elevated px-1">pg_dump</code>) plus a
        JSON export of settings and global templates. API keys stay encrypted in the export.
      </p>

      <Card className="mt-6 p-5">
        <Button onClick={handleBackup} disabled={busy}>
          <DatabaseBackup size={16} /> {busy ? "Backing up..." : "Backup Database + Configuration"}
        </Button>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {result && (
          <div className="mt-3 space-y-1 text-sm">
            <a href={result.dbUrl} className="flex items-center gap-1.5 text-signal hover:underline"><Download size={14} /> Download database dump</a>
            <a href={result.configUrl} className="flex items-center gap-1.5 text-signal hover:underline"><Download size={14} /> Download configuration export</a>
          </div>
        )}
      </Card>

      <h2 className="mb-2 mt-6 text-sm font-medium text-ink-muted">Recent backups</h2>
      <div className="space-y-2">
        {backups.map((b) => (
          <Card key={b.id} className="p-3 text-sm text-ink-muted">
            {new Date(b.createdAt).toLocaleString()}
          </Card>
        ))}
      </div>
    </div>
  );
}
