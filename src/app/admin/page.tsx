import { redirect } from "next/navigation";
import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { getModerationAccess } from "@/lib/exchange/moderation-auth";

export default async function AdminPage() {
  const access = await getModerationAccess();
  if (!access.userId || !access.isModerator) {
    redirect("/library");
  }

  return (
    <RoutePageIntro
      navActive="admin"
      title="Admin"
      description="Admin-only moderation, user-role tools, and homepage branding media management for Drill Exchange and Studio."
    >
      <AdminPanel canManageRoles={access.role === "admin"} />
    </RoutePageIntro>
  );
}
