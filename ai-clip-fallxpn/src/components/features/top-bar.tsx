"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { api } from "@/lib/api-client";
import type { CurrentUser } from "@/lib/auth/session";

export function TopBar({ user }: { user: CurrentUser }) {
  const router = useRouter();

  async function handleLogout() {
    await api.post("/auth/logout");
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-base-border bg-base/90 px-4 backdrop-blur md:px-8">
      <div className="md:hidden font-display text-lg font-bold text-ink">ClipFlow</div>
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-sm text-ink-muted sm:inline">{user.email}</span>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-card px-2.5 py-1.5 text-sm text-ink-muted hover:bg-base-surface hover:text-ink"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </header>
  );
}
