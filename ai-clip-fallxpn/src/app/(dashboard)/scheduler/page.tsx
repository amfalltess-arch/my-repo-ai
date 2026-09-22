"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw, X } from "lucide-react";

interface PublishJobRow {
  id: string;
  caption: string;
  scheduledFor: string | null;
  status: string;
  attempts: number;
  createdAt: string;
  clip: { index: number; title: string | null; thumbnailStorageKey: string | null };
  tiktokAccount: { username: string; avatarUrl: string | null };
}

const STATUS_TONE: Record<string, "neutral" | "signal" | "danger"> = {
  WAITING: "neutral",
  PROCESSING: "neutral",
  UPLOADING: "neutral",
  PUBLISHED: "signal",
  FAILED: "danger",
  RETRYING: "neutral",
  CANCELLED: "danger",
};

export default function SchedulerPage() {
  const [jobs, setJobs] = useState<PublishJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const data = await api.get<{ publishJobs: PublishJobRow[] }>("/tiktok/publish");
    setJobs(data.publishJobs);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  async function retry(id: string) {
    try {
      await api.post(`/tiktok/publish/${id}`);
      load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not retry.");
    }
  }

  async function cancel(id: string) {
    try {
      await api.delete(`/tiktok/publish/${id}`);
      load();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not cancel.");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-bold text-ink">Publishing Queue</h1>
      {message && <p className="mt-2 text-sm text-danger">{message}</p>}

      {!loading && jobs.length === 0 ? (
        <Card className="mt-6 p-10 text-center text-ink-muted">Nothing queued yet.</Card>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-base-border text-ink-muted">
                <th className="py-2 pr-3 font-medium">Video</th>
                <th className="py-2 pr-3 font-medium">Account</th>
                <th className="py-2 pr-3 font-medium">Schedule</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Attempts</th>
                <th className="py-2 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-base-border/60">
                  <td className="py-2.5 pr-3 text-ink">
                    #{String(job.clip.index).padStart(2, "0")} {job.clip.title ?? ""}
                  </td>
                  <td className="py-2.5 pr-3 text-ink-muted">@{job.tiktokAccount.username}</td>
                  <td className="py-2.5 pr-3 tabular text-ink-muted">
                    {job.scheduledFor ? new Date(job.scheduledFor).toLocaleString() : "Now"}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge tone={STATUS_TONE[job.status] ?? "neutral"}>{job.status}</Badge>
                  </td>
                  <td className="py-2.5 pr-3 tabular text-ink-muted">{job.attempts}</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex gap-1">
                      {job.status === "FAILED" && (
                        <button onClick={() => retry(job.id)} className="rounded p-1 text-ink-muted hover:text-signal">
                          <RotateCcw size={14} />
                        </button>
                      )}
                      {(job.status === "WAITING" || job.status === "UPLOADING") && (
                        <button onClick={() => cancel(job.id)} className="rounded p-1 text-ink-muted hover:text-danger">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
