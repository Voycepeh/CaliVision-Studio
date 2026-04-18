import { NextResponse } from "next/server";
import { countAdmins, requireAdminAccess } from "@/lib/admin/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as { role?: "user" | "moderator" | "admin" } | null;
  if (!body?.role || !["user", "moderator", "admin"].includes(body.role)) {
    return NextResponse.json({ error: "Valid role is required." }, { status: 400 });
  }

  if (access.requesterRole !== "admin") {
    return NextResponse.json({ error: "Only admins can manage roles." }, { status: 403 });
  }

  const { userId } = await params;
  if (body.role === "user" && userId === access.requesterId) {
    const adminCount = await countAdmins();
    if (adminCount <= 1) {
      return NextResponse.json({ error: "You cannot remove the last admin." }, { status: 400 });
    }
  }

  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Supabase service role key is not configured." }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const { error } = await service
    .from("user_profiles")
    .upsert({
      user_id: userId,
      role: body.role,
      updated_at: nowIso
    }, { onConflict: "user_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, role: body.role });
}
