"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Check } from "lucide-react";

const FIELDS: { key: string; label: string }[] = [
  { key: "highlight", label: "New Highlight" },
  { key: "title", label: "New Title" },
  { key: "description", label: "New Description" },
  { key: "hashtags", label: "New Hashtags" },
  { key: "caption", label: "New Caption" },
  { key: "subtitle", label: "New Subtitle" },
];

interface Preview {
  clipId: string;
  field: string;
  currentValue: unknown;
  proposedValue: unknown;
}

export function RegenerateModal({
  clipIds,
  onClose,
  onDone,
}: {
  clipIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [previews, setPreviews] = useState<Preview[] | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleField(key: string) {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<{ previews: Preview[]; queued: string[]; errors: string[] }>(
        "/clips/regenerate",
        { clipIds, fields: [...selectedFields] },
      );
      setPreviews(data.previews);
      setQueuedCount(data.queued.length);
      if (data.errors.length > 0) setError(data.errors.join("; "));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not regenerate.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!previews || previews.length === 0) {
      onDone();
      return;
    }
    setBusy(true);
    try {
      await api.post("/clips/regenerate/confirm", { previews });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not apply changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <Card className="max-h-[80vh] w-full max-w-lg overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Regenerate {clipIds.length} clip(s)</h2>
          <button onClick={onClose}><X size={18} className="text-ink-faint" /></button>
        </div>

        {!previews ? (
          <>
            <p className="mt-2 text-sm text-ink-muted">Choose what to regenerate. Nothing is changed until you review and confirm.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 rounded-card border border-base-border p-2 text-sm text-ink-muted">
                  <input type="checkbox" checked={selectedFields.has(f.key)} onChange={() => toggleField(f.key)} />
                  {f.label}
                </label>
              ))}
            </div>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <Button className="mt-4 w-full" disabled={busy || selectedFields.size === 0} onClick={handleGenerate}>
              {busy ? "Generating..." : "Generate preview"}
            </Button>
          </>
        ) : (
          <>
            {queuedCount > 0 && (
              <p className="mt-2 text-sm text-signal">
                {queuedCount} clip(s) queued for re-render (highlight/subtitle) — this happens in the background.
              </p>
            )}
            {previews.length > 0 && (
              <div className="mt-4 space-y-3">
                {previews.map((p, i) => (
                  <div key={i} className="rounded-card border border-base-border p-3 text-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{p.field}</p>
                    <p className="mt-1 text-ink-faint line-through">{formatValue(p.currentValue)}</p>
                    <p className="mt-1 text-ink">{formatValue(p.proposedValue)}</p>
                  </div>
                ))}
              </div>
            )}
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={onClose}>Discard</Button>
              <Button className="flex-1" disabled={busy} onClick={handleConfirm}>
                <Check size={16} /> Confirm
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => `#${x}`).join(" ");
  return String(v ?? "—");
}
