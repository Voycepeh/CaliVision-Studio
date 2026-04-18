import { NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/admin/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { userId } = await params;
  const service = createServiceSupabaseClient();
  if (!service) {
    return NextResponse.json({ error: "Supabase service role key is not configured." }, { status: 500 });
  }

  const [{ data: drafts, error: draftError }, { data: publications, error: publicationError }] = await Promise.all([
    service
      .from("hosted_drafts")
      .select("id, package_id, title, status, updated_at")
      .eq("owner_user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50),
    service
      .from("exchange_publications")
      .select("id, source_drill_id, visibility_status")
      .eq("owner_user_id", userId)
  ]);

  if (draftError) {
    return NextResponse.json({ error: draftError.message }, { status: 400 });
  }
  if (publicationError) {
    return NextResponse.json({ error: publicationError.message }, { status: 400 });
  }

  const publicationByDrillId = new Map<string, { id: string; status: string }>();
  for (const publication of publications ?? []) {
    publicationByDrillId.set(publication.source_drill_id, { id: publication.id, status: publication.visibility_status });
  }

  const drills = (drafts ?? []).map((draft) => ({
    id: draft.package_id,
    publicationId: publicationByDrillId.get(draft.package_id)?.id ?? null,
    title: draft.title,
    status: draft.status,
    updatedAtIso: draft.updated_at,
    exchangeStatus: publicationByDrillId.get(draft.package_id)?.status ?? null
  }));

  return NextResponse.json({ drills });
}
