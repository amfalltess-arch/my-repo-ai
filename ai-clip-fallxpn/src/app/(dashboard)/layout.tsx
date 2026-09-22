import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SidebarNav } from "@/components/features/sidebar-nav";
import { TopBar } from "@/components/features/top-bar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <SidebarNav isAdmin={user.role === "ADMIN"} />
      <div className="flex flex-1 flex-col md:pl-60">
        <TopBar user={user} />
        <main className="flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-8">{children}</main>
      </div>
    </div>
  );
}
