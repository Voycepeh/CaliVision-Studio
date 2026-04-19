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
      .limit(100),
    service
      .from("exchange_publications")
      .select("id, source_drill_id, title, visibility_status, is_active, published_at, updated_at")
      .eq("owner_user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(100)
  ]);

  if (draftError) {
    return NextResponse.json({ error: draftError.message }, { status: 400 });
  }
  if (publicationError) {
    return NextResponse.json({ error: publicationError.message }, { status: 400 });
  }

  const draftByDrillId = new Map((drafts ?? []).map((draft) => [draft.package_id, draft]));
  const publicationByDrillId = new Map((publications ?? []).map((publication) => [publication.source_drill_id, publication]));

  const sourceDrillIds = new Set<string>([
    ...Array.from(draftByDrillId.keys()),
    ...Array.from(publicationByDrillId.keys())
  ]);

  const drills = Array.from(sourceDrillIds)
    .map((sourceDrillId) => {
      const draft = draftByDrillId.get(sourceDrillId);
      const publication = publicationByDrillId.get(sourceDrillId);
      return {
        id: sourceDrillId,
        sourceDrillId,
        publicationId: publication?.id ?? null,
        title: draft?.title ?? publication?.title ?? sourceDrillId,
        status: draft?.status ?? "published_only",
        updatedAtIso: draft?.updated_at ?? publication?.updated_at ?? publication?.published_at ?? new Date(0).toISOString(),
        exchangeStatus: publication?.visibility_status ?? null,
        publicationUpdatedAtIso: publication?.updated_at ?? null,
        publicationPublishedAtIso: publication?.published_at ?? null,
        publicationIsActive: publication?.is_active ?? null
      };
    })
    .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));

  return NextResponse.json({ drills });
}
