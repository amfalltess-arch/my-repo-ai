"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ScoreBadge, Badge } from "@/components/ui/card";
import { GenerationStatusBadge } from "@/components/features/generation-status-badge";
import { BulkEditModal } from "@/components/features/bulk-edit-modal";
import { RegenerateModal } from "@/components/features/regenerate-modal";
import { Download, RefreshCw, Send, Pencil, CheckSquare, Square, PencilLine, Wand2 } from "lucide-react";

interface ClipItem {
  id: string;
  index: number;
  title: string | null;
  durationSec: number | null;
  score: number | null;
  status: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  publishJobs: { status: string }[];
}
interface GenerationDetail {
  id: string;
  status: string;
  progress: number;
  currentStep: string | null;
  requestedCount: number;
  actualCount: number | null;
  failureReason: string | null;
  video: { title: string | null };
  clips: ClipItem[];
}

const TERMINAL_STATUSES = ["COMPLETED", "COMPLETED_WITH_WARNINGS", "FAILED"];

export default function GenerationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [generation, setGeneration] = useState<GenerationDetail | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);

  async function refresh() {
    try {
      const data = await api.get<{ generation: GenerationDetail }>(`/generations/${id}`);
      setGeneration(data.generation);
    } catch {
      // transient errors are fine here; the next SSE tick or manual refresh will recover
    }
  }

  useEffect(() => {
    refresh();
  }, [id]);

  useEffect(() => {
    if (!generation || TERMINAL_STATUSES.includes(generation.status)) return;
    const source = new EventSource(`/api/generations/${id}/progress`);
    source.onmessage = () => refresh();
    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation?.status, id]);

  if (!generation) {
    return <p className="text-ink-muted">Loading...</p>;
  }

  const isDone = TERMINAL_STATUSES.includes(generation.status);

  if (!isDone) {
    return (
      <div className="mx-auto max-w-lg pt-16 text-center">
        <div className="mx-auto mb-6 h-16 w-16 animate-pulse rounded-full bg-signal-bg" />
        <h1 className="font-display text-xl font-bold text-ink">{generation.currentStep ?? "Working..."}</h1>
        <p className="mt-1 text-sm text-ink-muted">{generation.video.title}</p>
        <div className="mt-6">
          <ProgressBar value={generation.progress} />
          <p className="mt-2 tabular text-sm text-ink-muted">{generation.progress}%</p>
        </div>
      </div>
    );
  }

  const readyClips = generation.clips.filter((c) => c.status === "READY");
  const failedClips = generation.clips.filter((c) => c.status === "FAILED");

  async function toggle(clipId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(clipId) ? next.delete(clipId) : next.add(clipId);
      return next;
    });
  }

  async function selectAll() {
    setSelected(new Set(readyClips.map((c) => c.id)));
  }

  async function handleRetryFailed() {
    setBusy(true);
    try {
      await api.post(`/generations/${id}/retry-failed`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Retry failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkDownload() {
    setBusy(true);
    setMessage(null);
    try {
      const { jobId } = await api.post<{ jobId: string }>("/clips/bulk-download", {
        clipIds: [...selected],
        includeTxt: true,
      });
      // Poll until the ZIP is ready.
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const status = await api.get<{ status: string; downloadUrl?: string }>(
          `/clips/bulk-download?jobId=${jobId}`,
        );
        if (status.status === "COMPLETED" && status.downloadUrl) {
          window.location.href = status.downloadUrl;
          return;
        }
        if (status.status === "FAILED") throw new Error("Export failed.");
      }
      setMessage("Export is taking longer than expected — check back shortly.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Your Videos</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {generation.actualCount ?? generation.clips.length} results • {generation.video.title}
          </p>
        </div>
        <GenerationStatusBadge status={generation.status as never} />
      </div>

      {generation.failureReason && (
        <Card className="mt-4 border-score-mid/30 bg-score-bg p-4 text-sm text-ink">
          {generation.failureReason}
        </Card>
      )}

      {failedClips.length > 0 && (
        <Card className="mt-4 flex items-center justify-between p-4">
          <p className="text-sm text-ink">
            {readyClips.length} successful, {failedClips.length} failed
          </p>
          <Button size="sm" variant="secondary" disabled={busy} onClick={handleRetryFailed}>
            <RefreshCw size={14} /> Retry Failed
          </Button>
        </Card>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={selectAll}>
          Select all {readyClips.length}
        </Button>
        {selected.size > 0 && (
          <>
            <span className="text-sm text-ink-muted">{selected.size} / {readyClips.length} selected</span>
            <Button size="sm" variant="secondary" disabled={busy} onClick={handleBulkDownload}>
              <Download size={14} /> Download selected
            </Button>
            <Link href={`/scheduler?clips=${[...selected].join(",")}`}>
              <Button size="sm" variant="secondary">
                <Send size={14} /> Publish selected
              </Button>
            </Link>
            <Button size="sm" variant="secondary" onClick={() => setShowBulkEdit(true)}>
              <PencilLine size={14} /> Bulk edit
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowRegenerate(true)}>
              <Wand2 size={14} /> Regenerate selected
            </Button>
          </>
        )}
      </div>
      {message && <p className="mt-2 text-sm text-danger">{message}</p>}

      {showBulkEdit && (
        <BulkEditModal
          clipIds={[...selected]}
          onClose={() => setShowBulkEdit(false)}
          onDone={() => { setShowBulkEdit(false); refresh(); }}
        />
      )}
      {showRegenerate && (
        <RegenerateModal
          clipIds={[...selected]}
          onClose={() => setShowRegenerate(false)}
          onDone={() => { setShowRegenerate(false); refresh(); }}
        />
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {generation.clips.map((clip) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            selected={selected.has(clip.id)}
            onToggle={() => toggle(clip.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ClipCard({
  clip,
  selected,
  onToggle,
}: {
  clip: ClipItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const tiktokStatus = clip.publishJobs[0]?.status;

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[9/16] bg-base-elevated">
        {clip.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clip.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-faint">
            {clip.status === "FAILED" ? "Failed" : "Processing..."}
          </div>
        )}
        {clip.status === "READY" && (
          <button
            onClick={onToggle}
            className="absolute right-2 top-2 rounded bg-base/70 p-1 text-ink backdrop-blur"
          >
            {selected ? <CheckSquare size={16} className="text-signal" /> : <Square size={16} />}
          </button>
        )}
      </div>
      <div className="space-y-1.5 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-faint">#{String(clip.index).padStart(2, "0")}</span>
          <ScoreBadge score={clip.score} />
        </div>
        <p className="line-clamp-2 text-sm font-medium text-ink">{clip.title}</p>
        <div className="flex items-center justify-between text-xs text-ink-faint">
          <span>{clip.durationSec ? `${Math.round(clip.durationSec)}s` : "—"}</span>
          {tiktokStatus && <Badge tone={tiktokStatus === "PUBLISHED" ? "signal" : "neutral"}>{tiktokStatus}</Badge>}
        </div>
        <div className="flex gap-1 pt-1">
          {clip.videoUrl && (
            <a href={clip.videoUrl} download className="flex-1">
              <Button size="sm" variant="secondary" className="w-full">
                <Download size={13} />
              </Button>
            </a>
          )}
          <Link href={`/clips/${clip.id}/edit`} className="flex-1">
            <Button size="sm" variant="secondary" className="w-full">
              <Pencil size={13} />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
