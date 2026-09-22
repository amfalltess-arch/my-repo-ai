"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Defaults {
  defaultVideoCount: number;
  maxVideoCount: number;
  defaultClipMinSec: number;
  defaultClipMaxSec: number;
  defaultAspectRatio: "RATIO_9_16" | "RATIO_1_1" | "RATIO_16_9";
  defaultSubtitleEnabled: boolean;
  defaultSubtitleStyle: string;
}

export default function AdminSettingsPage() {
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<{ defaults: Defaults }>("/admin/settings").then((d) => setDefaults(d.defaults));
  }, []);

  async function handleSave() {
    if (!defaults) return;
    await api.put("/admin/settings", defaults);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!defaults) return <p className="text-ink-muted">Loading...</p>;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-2xl font-bold text-ink">Generation Defaults</h1>
      <p className="mt-1 text-sm text-ink-muted">Applied as the starting values on every user's Create page.</p>

      <Card className="mt-6 space-y-4 p-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Default videos">
            <input type="number" value={defaults.defaultVideoCount}
              onChange={(e) => setDefaults({ ...defaults, defaultVideoCount: Number(e.target.value) })} className={inputClass} />
          </Field>
          <Field label="Maximum videos">
            <input type="number" value={defaults.maxVideoCount}
              onChange={(e) => setDefaults({ ...defaults, maxVideoCount: Number(e.target.value) })} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Default clip min (s)">
            <input type="number" value={defaults.defaultClipMinSec}
              onChange={(e) => setDefaults({ ...defaults, defaultClipMinSec: Number(e.target.value) })} className={inputClass} />
          </Field>
          <Field label="Default clip max (s)">
            <input type="number" value={defaults.defaultClipMaxSec}
              onChange={(e) => setDefaults({ ...defaults, defaultClipMaxSec: Number(e.target.value) })} className={inputClass} />
          </Field>
        </div>
        <Field label="Default aspect ratio">
          <select value={defaults.defaultAspectRatio}
            onChange={(e) => setDefaults({ ...defaults, defaultAspectRatio: e.target.value as Defaults["defaultAspectRatio"] })}
            className={inputClass}>
            <option value="RATIO_9_16">9:16</option>
            <option value="RATIO_1_1">1:1</option>
            <option value="RATIO_16_9">16:9</option>
          </select>
        </Field>
        <Field label="Default subtitle">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" checked={defaults.defaultSubtitleEnabled}
                onChange={(e) => setDefaults({ ...defaults, defaultSubtitleEnabled: e.target.checked })} />
              Enabled
            </label>
            <select value={defaults.defaultSubtitleStyle}
              onChange={(e) => setDefaults({ ...defaults, defaultSubtitleStyle: e.target.value })} className={inputClass}>
              {["KARAOKE", "BOLD", "MINIMAL", "HIGHLIGHT_WORD", "PODCAST", "GAMING", "MODERN", "CLEAN"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </Field>

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave}>Save defaults</Button>
          {saved && <span className="text-sm text-signal">Saved.</span>}
        </div>
      </Card>
    </div>
  );
}

const inputClass = "w-full rounded-card border border-base-border bg-base-raised px-3 py-1.5 text-sm text-ink outline-none focus:border-signal";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-ink-muted">{label}</label>
      {children}
    </div>
  );
}
