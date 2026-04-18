import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function resolveDisplayName(user: { user_metadata?: Record<string, unknown>; email?: string | null; id: string }): string {
  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
  const name = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : null;
  return fullName ?? name ?? user.email ?? user.id.slice(0, 8);
}

export async function POST() {
  const serverClient = await createServerSupabaseClient();
  if (!serverClient) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const {
    data: { user }
  } = await serverClient.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const provider = typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : null;
  const nowIso = new Date().toISOString();
  await serverClient.from("user_profiles").upsert(
    {
      user_id: user.id,
      email: user.email ?? null,
      display_name: resolveDisplayName(user),
      provider,
      last_active_at: nowIso,
      updated_at: nowIso
    },
    { onConflict: "user_id" }
  );

  return NextResponse.json({ ok: true, lastActiveAt: nowIso });
}
