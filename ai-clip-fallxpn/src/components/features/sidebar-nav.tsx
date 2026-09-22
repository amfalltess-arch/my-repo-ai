"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Sparkles,
  Film,
  Music2,
  CalendarClock,
  Settings,
  ShieldCheck,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/create", label: "Create", icon: Sparkles },
  { href: "/videos", label: "Videos", icon: Film },
  { href: "/tiktok", label: "TikTok", icon: Music2 },
  { href: "/scheduler", label: "Scheduler", icon: CalendarClock },
  { href: "/settings/templates", label: "Settings", icon: Settings },
];

export function SidebarNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-base-border bg-base-raised md:flex">
        <div className="flex h-16 items-center gap-2 px-5">
          <div className="h-6 w-6 rounded bg-signal" />
          <span className="font-display text-lg font-bold text-ink">ClipFlow</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
          ))}
        </nav>
        {isAdmin && (
          <div className="border-t border-base-border p-3">
            <NavLink
              item={{ href: "/admin", label: "Admin Panel", icon: ShieldCheck }}
              active={pathname.startsWith("/admin")}
            />
          </div>
        )}
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-base-border bg-base-raised py-2 md:hidden">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex flex-col items-center gap-0.5 px-2 py-1 text-[11px]",
                active ? "text-signal" : "text-ink-faint",
              )}
            >
              <item.icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function NavLink({
  item,
  active,
}: {
  item: { href: string; label: string; icon: typeof LayoutDashboard };
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={clsx(
        "flex items-center gap-3 rounded-card px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-signal-bg text-signal"
          : "text-ink-muted hover:bg-base-surface hover:text-ink",
      )}
    >
      <item.icon size={18} />
      {item.label}
    </Link>
  );
}
