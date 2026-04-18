import { createServerSupabaseClient } from "@/lib/supabase/server";

function parseModeratorAllowList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

export async function getModerationAccess(): Promise<{ userId: string | null; isModerator: boolean }> {
  const serverClient = await createServerSupabaseClient();
  if (!serverClient) {
    return { userId: null, isModerator: false };
  }

  const {
    data: { user }
  } = await serverClient.auth.getUser();
  if (!user?.id) {
    return { userId: null, isModerator: false };
  }

  const role = typeof user.app_metadata?.role === "string" ? user.app_metadata.role.toLowerCase() : "";
  const directRole = typeof user.user_metadata?.role === "string" ? user.user_metadata.role.toLowerCase() : "";
  const moderatorClaim = user.app_metadata?.exchange_moderator === true;
  const allowList = parseModeratorAllowList(process.env.EXCHANGE_MODERATOR_USER_IDS);
  const isModerator = role === "admin" || role === "moderator" || directRole === "admin" || directRole === "moderator" || moderatorClaim || allowList.has(user.id);

  return { userId: user.id, isModerator };
}
