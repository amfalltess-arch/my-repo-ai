"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Music2, Plus } from "lucide-react";

interface Account {
  id: string;
  username: string;
  avatarUrl: string | null;
  status: string;
  lastUsedAt: string | null;
}

function TikTokPageContent() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");

  async function load() {
    const data = await api.get<{ accounts: Account[] }>("/tiktok/accounts");
    setAccounts(data.accounts);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDisconnect(id: string) {
    if (!confirm("Disconnect this TikTok account?")) return;
    await api.delete(`/tiktok/accounts/${id}`);
    load();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">TikTok Accounts</h1>
        <a href="/api/tiktok/oauth/start">
          <Button size="sm">
            <Plus size={14} /> Connect
          </Button>
        </a>
      </div>

      {oauthError && (
        <Card className="mt-4 border-danger/30 bg-danger-bg p-4 text-sm text-danger">{oauthError}</Card>
      )}

      {!loading && accounts.length === 0 && (
        <Card className="mt-6 p-10 text-center">
          <Music2 className="mx-auto mb-3 text-ink-faint" size={28} />
          <p className="text-ink-muted">No TikTok account connected yet.</p>
          <a href="/api/tiktok/oauth/start" className="mt-3 inline-block">
            <Button variant="secondary">Connect TikTok</Button>
          </a>
        </Card>
      )}

      <div className="mt-6 space-y-3">
        {accounts.map((a) => (
          <Card key={a.id} className="flex items-center gap-4 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.avatarUrl ?? "https://placehold.co/48"}
              alt=""
              className="h-12 w-12 rounded-full object-cover"
            />
            <div className="flex-1">
              <p className="font-medium text-ink">@{a.username}</p>
              <p className="text-xs text-ink-muted">
                {a.status === "connected" ? "Connected" : a.status} •{" "}
                {a.lastUsedAt ? `Last used ${new Date(a.lastUsedAt).toLocaleDateString()}` : "Never used"}
              </p>
            </div>
            <Button size="sm" variant="danger" onClick={() => handleDisconnect(a.id)}>
              Disconnect
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// `useSearchParams()` must sit under a Suspense boundary, otherwise
// `next build` fails while prerendering this page.
export default function TikTokPage() {
  return (
    <Suspense fallback={null}>
      <TikTokPageContent />
    </Suspense>
  );
}
