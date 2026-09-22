"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X } from "lucide-react";

const SUBTITLE_STYLES = ["KARAOKE", "BOLD", "MINIMAL", "HIGHLIGHT_WORD", "PODCAST", "GAMING", "MODERN", "CLEAN"];

export function BulkEditModal({
  clipIds,
  onClose,
  onDone,
}: {
  clipIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [hashtags, setHashtags] = useState("");
  const [description, setDescription] = useState("");
  const [subtitleStyle, setSubtitleStyle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/clips/bulk-edit", {
        clipIds,
        ...(hashtags ? { hashtags: hashtags.split(",").map((h) => h.trim()).filter(Boolean) } : {}),
        ...(description ? { description } : {}),
        ...(subtitleStyle ? { subtitleStyle } : {}),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not apply changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <Card className="w-full max-w-md p-5 sm:mb-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-ink">Bulk edit {clipIds.length} clips</h2>
          <button onClick={onClose}><X size={18} className="text-ink-faint" /></button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Hashtags (comma separated) — applies to all selected</label>
            <input value={hashtags} onChange={(e) => setHashtags(e.target.value)}
              className="w-full rounded-card border border-base-border bg-base-raised px-3 py-2 text-sm text-ink outline-none focus:border-signal" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Description — applies to all selected</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full rounded-card border border-base-border bg-base-raised px-3 py-2 text-sm text-ink outline-none focus:border-signal" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">Subtitle style — re-renders selected clips</label>
            <select value={subtitleStyle} onChange={(e) => setSubtitleStyle(e.target.value)}
              className="w-full rounded-card border border-base-border bg-base-raised px-3 py-2 text-sm text-ink outline-none focus:border-signal">
              <option value="">No change</option>
              {SUBTITLE_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <Button className="mt-4 w-full" disabled={busy} onClick={handleApply}>
          {busy ? "Applying..." : `Apply to selected`}
        </Button>
      </Card>
    </div>
  );
}
