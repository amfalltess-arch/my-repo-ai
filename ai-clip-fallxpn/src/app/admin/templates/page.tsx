"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";

interface Template {
  id: string;
  name: string;
  bio: string;
  hashtags: string[];
}

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await api.get<{ templates: Template[] }>("/admin/templates");
    setTemplates(data.templates);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    setError(null);
    try {
      await api.post("/admin/templates", {
        name, bio, hashtags: hashtags.split(",").map((h) => h.trim()).filter(Boolean),
      });
      setName(""); setBio(""); setHashtags(""); setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this global template? It's currently usable by every user.")) return;
    await api.delete(`/admin/templates/${id}`);
    load();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Global Templates</h1>
          <p className="mt-1 text-sm text-ink-muted">Available to every user alongside their own templates.</p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}><Plus size={14} /> New</Button>
      </div>

      {showForm && (
        <Card className="mt-4 space-y-3 p-5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name"
            className="w-full rounded-card border border-base-border bg-base-raised px-3 py-2 text-sm text-ink outline-none focus:border-signal" />
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="Bio / caption text"
            className="w-full rounded-card border border-base-border bg-base-raised px-3 py-2 text-sm text-ink outline-none focus:border-signal" />
          <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="Hashtags, comma separated"
            className="w-full rounded-card border border-base-border bg-base-raised px-3 py-2 text-sm text-ink outline-none focus:border-signal" />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button onClick={handleCreate} disabled={!name || !bio}>Save</Button>
        </Card>
      )}

      <div className="mt-6 space-y-3">
        {templates.map((t) => (
          <Card key={t.id} className="flex items-start justify-between p-4">
            <div>
              <p className="font-medium text-ink">{t.name}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{t.bio}</p>
            </div>
            <button onClick={() => handleDelete(t.id)} className="text-ink-faint hover:text-danger">
              <Trash2 size={16} />
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
