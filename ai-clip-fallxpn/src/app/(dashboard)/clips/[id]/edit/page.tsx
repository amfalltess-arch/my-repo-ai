"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, Download } from "lucide-react";

interface ClipDetail {
  id: string;
  generationId: string;
  title: string | null;
  description: string | null;
  hashtags: string[];
  score: number | null;
  category: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  textVariants: { id: string; label: string; description: string | null }[];
}

export default function ClipEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [clip, setClip] = useState<ClipDetail | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ clip: ClipDetail }>(`/clips/${id}`).then((d) => {
      setClip(d.clip);
      setTitle(d.clip.title ?? "");
      setDescription(d.clip.description ?? "");
      setHashtags(d.clip.hashtags.join(", "));
    });
  }, [id]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/clips/${id}`, {
        title,
        description,
        hashtags: hashtags.split(",").map((h) => h.trim()).filter(Boolean),
      });
      if (clip) router.push(`/generations/${clip.generationId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (!clip) return <p className="text-ink-muted">Loading...</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={() => router.push(`/generations/${clip.generationId}`)}
        className="mb-4 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={14} /> Back to results
      </button>

      <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
        <div>
          <div className="aspect-[9/16] overflow-hidden rounded-card bg-base-elevated">
            {clip.videoUrl ? (
              <video src={clip.videoUrl} controls className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-ink-faint">No preview</div>
            )}
          </div>
          {clip.videoUrl && (
            <a href={clip.videoUrl} download className="mt-2 block">
              <Button variant="secondary" size="sm" className="w-full">
                <Download size={14} /> Download
              </Button>
            </a>
          )}
        </div>

        <Card className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-sm text-ink-muted">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-card border border-base-border bg-base-raised px-3 py-2 text-ink outline-none focus:border-signal"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink-muted">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full rounded-card border border-base-border bg-base-raised px-3 py-2 text-ink outline-none focus:border-signal"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink-muted">Hashtags (comma separated)</label>
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="w-full rounded-card border border-base-border bg-base-raised px-3 py-2 text-ink outline-none focus:border-signal"
            />
          </div>

          {clip.textVariants.length > 0 && (
            <div>
              <p className="mb-2 text-sm text-ink-muted">Text variants</p>
              <div className="space-y-2">
                {clip.textVariants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => v.description && setDescription(v.description)}
                    className="block w-full rounded-card border border-base-border p-2 text-left text-xs text-ink-muted hover:border-signal hover:text-ink"
                  >
                    <span className="font-medium text-ink">{v.label}:</span> {v.description}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save size={16} /> {saving ? "Saving..." : "Save changes"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
