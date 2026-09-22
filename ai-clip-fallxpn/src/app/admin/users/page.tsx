"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  maxVideosPerGeneration: number | null;
  maxVideoDurationSec: number | null;
  maxUploadSizeMb: number | null;
  dailyGenerationLimit: number | null;
  concurrentJobLimit: number | null;
  _count: { videos: number; generations: number };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<UserRow>>({});

  async function load() {
    const data = await api.get<{ users: UserRow[] }>("/admin/users");
    setUsers(data.users);
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(user: UserRow) {
    setEditing(user.id);
    setDraft(user);
  }

  async function save(id: string) {
    await api.patch(`/admin/users/${id}`, {
      maxVideosPerGeneration: draft.maxVideosPerGeneration ?? null,
      maxVideoDurationSec: draft.maxVideoDurationSec ?? null,
      maxUploadSizeMb: draft.maxUploadSizeMb ?? null,
      dailyGenerationLimit: draft.dailyGenerationLimit ?? null,
      concurrentJobLimit: draft.concurrentJobLimit ?? null,
    });
    setEditing(null);
    load();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-bold text-ink">Users</h1>
      <div className="mt-6 space-y-3">
        {users.map((user) => (
          <Card key={user.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-ink">
                  {user.email} {user.role === "ADMIN" && <Badge tone="signal">Admin</Badge>}
                </p>
                <p className="text-xs text-ink-muted">
                  {user._count.videos} videos • {user._count.generations} generations
                </p>
              </div>
              {editing === user.id ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button size="sm" onClick={() => save(user.id)}>Save</Button>
                </div>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => startEdit(user)}>Edit limits</Button>
              )}
            </div>

            {editing === user.id ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <LimitField label="Max videos/gen" value={draft.maxVideosPerGeneration} onChange={(v) => setDraft((d) => ({ ...d, maxVideosPerGeneration: v }))} />
                <LimitField label="Max duration (s)" value={draft.maxVideoDurationSec} onChange={(v) => setDraft((d) => ({ ...d, maxVideoDurationSec: v }))} />
                <LimitField label="Max upload (MB)" value={draft.maxUploadSizeMb} onChange={(v) => setDraft((d) => ({ ...d, maxUploadSizeMb: v }))} />
                <LimitField label="Daily gen limit" value={draft.dailyGenerationLimit} onChange={(v) => setDraft((d) => ({ ...d, dailyGenerationLimit: v }))} />
                <LimitField label="Concurrent jobs" value={draft.concurrentJobLimit} onChange={(v) => setDraft((d) => ({ ...d, concurrentJobLimit: v }))} />
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-faint">
                <span>Max videos/gen: {user.maxVideosPerGeneration ?? "default"}</span>
                <span>Max duration: {user.maxVideoDurationSec ? `${user.maxVideoDurationSec}s` : "default"}</span>
                <span>Daily limit: {user.dailyGenerationLimit ?? "unlimited"}</span>
                <span>Concurrent jobs: {user.concurrentJobLimit ?? "default"}</span>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function LimitField({
  label, value, onChange,
}: { label: string; value: number | null | undefined; onChange: (v: number | null) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-ink-faint">{label}</label>
      <input
        type="number"
        value={value ?? ""}
        placeholder="default"
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="w-full rounded-card border border-base-border bg-base-raised px-2 py-1 text-xs text-ink outline-none focus:border-signal"
      />
    </div>
  );
}
