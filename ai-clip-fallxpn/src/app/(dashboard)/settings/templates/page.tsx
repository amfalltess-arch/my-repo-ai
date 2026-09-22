"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

interface Template {
  id: string;
  name: string;
  bio: string;
  cta: string | null;
  hashtags: string[];
  isGlobal: boolean;
}

const VARIABLE_HINTS = [
  "{{title}}", "{{description}}", "{{hashtags}}", "{{clip_number}}",
  "{{category}}", "{{score}}", "{{duration}}", "{{channel}}", "{{date}}", "{{cta}}",
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [cta, setCta] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await api.get<{ templates: Template[] }>("/templates");
    setTemplates(data.templates);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    setError(null);
    try {
      await api.post("/templates", {
        name,
        bio,
        cta: cta || undefined,
        hashtags: hashtags.split(",").map((h) => h.trim()).filter(Boolean),
      });
      setName(""); setBio(""); setCta(""); setHashtags("");
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save template.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    await api.delete(`/templates/${id}`);
    load();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Content Templates</h1>
          <p className="mt-1 text-sm text-ink-muted">
            One bio/caption template applies automatically to every clip in a batch.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus size={14} /> New
        </Button>
      </div>

      {showForm && (
        <Card className="mt-4 space-y-3 p-5">
          <input
            placeholder="Template name (e.g. Default TikTok)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-card border border-base-border bg-base-raised px-3 py-2 text-sm text-ink outline-none focus:border-signal"
          />
          <textarea
            placeholder="Bio / caption text — use {{variables}} below"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            className="w-full rounded-card border border-base-border bg-base-raised px-3 py-2 text-sm text-ink outline-none focus:border-signal"
          />
          <input
            placeholder="CTA (optional)"
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            className="w-full rounded-card border border-base-border bg-base-raised px-3 py-2 text-sm text-ink outline-none focus:border-signal"
          />
          <input
            placeholder="Hashtags, comma separated (fyp, viral, ...)"
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            className="w-full rounded-card border border-base-border bg-base-raised px-3 py-2 text-sm text-ink outline-none focus:border-signal"
          />
          <div className="flex flex-wrap gap-1.5">
            {VARIABLE_HINTS.map((v) => (
              <Badge key={v} tone="neutral">{v}</Badge>
            ))}
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button onClick={handleCreate} disabled={!name || !bio}>Save template</Button>
        </Card>
      )}

      <div className="mt-6 space-y-3">
        {templates.map((t) => (
          <Card key={t.id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-ink">
                  {t.name} {t.isGlobal && <Badge tone="signal">Global</Badge>}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{t.bio}</p>
              </div>
              {!t.isGlobal && (
                <button onClick={() => handleDelete(t.id)} className="text-ink-faint hover:text-danger">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
