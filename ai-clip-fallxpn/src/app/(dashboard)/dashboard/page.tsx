import { redirect } from "next/navigation";

// Login, the sidebar and the root page all point at /dashboard. There was no
// page at that path (only the (dashboard) route group), which produced a 404
// right after signing in. Send people to the create flow, the main entry point.
export default function DashboardPage() {
  redirect("/create");
}
