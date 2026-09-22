import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import {
  LayoutDashboard, Users, Cpu, FileText, SlidersHorizontal,
  ListChecks, ScrollText, HardDrive, DatabaseBackup, ArrowLeft,
} from "lucide-react";

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/ai-providers", label: "AI Providers", icon: Cpu },
  { href: "/admin/templates", label: "Templates", icon: FileText },
  { href: "/admin/settings", label: "Generation Defaults", icon: SlidersHorizontal },
  { href: "/admin/queue", label: "Queue", icon: ListChecks },
  { href: "/admin/logs", label: "Logs", icon: ScrollText },
  { href: "/admin/storage", label: "Storage", icon: HardDrive },
  { href: "/admin/backup", label: "Backup", icon: DatabaseBackup },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-base-border bg-base-raised md:flex">
        <div className="flex h-16 items-center gap-2 px-5">
          <div className="h-6 w-6 rounded bg-score-mid" />
          <span className="font-display text-lg font-bold text-ink">Admin</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-card px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-base-surface hover:text-ink"
            >
              <item.icon size={17} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-base-border p-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-card px-3 py-2 text-sm font-medium text-ink-muted hover:bg-base-surface hover:text-ink"
          >
            <ArrowLeft size={17} /> Back to app
          </Link>
        </div>
      </aside>
      <div className="flex-1 px-4 py-6 md:ml-60 md:px-8">{children}</div>
    </div>
  );
}
