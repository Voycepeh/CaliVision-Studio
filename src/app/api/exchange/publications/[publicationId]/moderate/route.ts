import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getModerationAccess } from "@/lib/exchange/moderation-auth";

type ModerationAction = "hide" | "archive" | "delete";

function actionToStatus(action: ModerationAction): "hidden" | "archived" | "deleted" {
  if (action === "hide") return "hidden";
  if (action === "archive") return "archived";
  return "deleted";
}

export async function POST(request: Request, { params }: { params: Promise<{ publicationId: string }> }) {
  const access = await getModerationAccess();
  if (!access.userId) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }
  if (!access.isModerator) {
    return NextResponse.json({ error: "Moderator access is required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { action?: ModerationAction; reason?: string } | null;
  if (!body?.action || !["hide", "archive", "delete"].includes(body.action)) {
    return NextResponse.json({ error: "Valid moderation action is required." }, { status: 400 });
  }

  const { publicationId } = await params;
  const serviceClient = createServiceSupabaseClient();
  if (!serviceClient) {
    return NextResponse.json({ error: "Supabase service role key is not configured." }, { status: 500 });
  }

  const payload = {
    visibility_status: actionToStatus(body.action),
    moderation_reason: body.reason?.trim() || null,
    moderated_by: access.userId,
    moderated_at: new Date().toISOString(),
    is_active: body.action === "delete" ? false : true
  };

  const { data, error } = await serviceClient
    .from("exchange_publications")
    .update(payload)
    .eq("id", publicationId)
    .select("id")
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Publication not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, visibilityStatus: payload.visibility_status });
}
