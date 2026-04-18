import { createServerSupabaseClient } from "@/lib/supabase/server";

function parseModeratorAllowList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

export type ModerationRole = "user" | "moderator" | "admin";

export async function getModerationAccess(): Promise<{ userId: string | null; isModerator: boolean; role: ModerationRole }> {
  const serverClient = await createServerSupabaseClient();
  if (!serverClient) {
    return { userId: null, isModerator: false, role: "user" };
  }

  const {
    data: { user }
  } = await serverClient.auth.getUser();
  if (!user?.id) {
    return { userId: null, isModerator: false, role: "user" };
  }

  const { data: profile } = await serverClient
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const profileRole = profile?.role === "moderator" || profile?.role === "admin" ? profile.role : "user";
  const metadataRole = typeof user.app_metadata?.role === "string" ? user.app_metadata.role.toLowerCase() : "";
  const moderatorClaim = user.app_metadata?.exchange_moderator === true;
  const allowList = parseModeratorAllowList(process.env.EXCHANGE_MODERATOR_USER_IDS);
  const fallbackModerator = metadataRole === "admin" || metadataRole === "moderator" || moderatorClaim || allowList.has(user.id);
  const effectiveRole = profileRole === "user" && fallbackModerator ? (metadataRole === "admin" ? "admin" : "moderator") : profileRole;
  const isModerator = effectiveRole === "admin" || effectiveRole === "moderator" || fallbackModerator;

  return { userId: user.id, isModerator, role: effectiveRole };
}
