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

export function resolveModerationRole(input: {
  profileRole: unknown;
  metadataRole: unknown;
  moderatorClaim: unknown;
  userId: string;
  allowList: Set<string>;
}): { role: ModerationRole; isModerator: boolean } {
  const profileRole = input.profileRole === "admin" || input.profileRole === "moderator" ? input.profileRole : "user";
  const metadataRole = typeof input.metadataRole === "string" ? input.metadataRole.toLowerCase() : "";
  const metadataRoleResolved: ModerationRole = metadataRole === "admin" ? "admin" : metadataRole === "moderator" ? "moderator" : "user";
  const moderatorClaim = input.moderatorClaim === true;

  const fallbackModerator = metadataRoleResolved !== "user" || moderatorClaim || input.allowList.has(input.userId);
  const fallbackRole: ModerationRole = metadataRoleResolved !== "user" ? metadataRoleResolved : "moderator";
  const effectiveRole: ModerationRole = profileRole !== "user" ? profileRole : fallbackModerator ? fallbackRole : "user";
  const isModerator = effectiveRole === "admin" || effectiveRole === "moderator";

  return { role: effectiveRole, isModerator };
}

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

  const allowList = parseModeratorAllowList(process.env.EXCHANGE_MODERATOR_USER_IDS);
  const resolved = resolveModerationRole({
    profileRole: profile?.role,
    metadataRole: user.app_metadata?.role,
    moderatorClaim: user.app_metadata?.exchange_moderator,
    userId: user.id,
    allowList
  });

  return { userId: user.id, isModerator: resolved.isModerator, role: resolved.role };
}
