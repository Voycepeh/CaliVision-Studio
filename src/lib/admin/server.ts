import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { getModerationAccess } from "@/lib/exchange/moderation-auth";
import type { AdminUserRole, AdminUserSummary } from "@/lib/admin/types";

function coerceRole(value: unknown): AdminUserRole {
  if (value === "admin" || value === "moderator") {
    return value;
  }
  return "user";
}

function coerceRoleFromSources(profileRole: unknown, metadataRole: unknown): AdminUserRole {
  const databaseRole = coerceRole(profileRole);
  if (databaseRole !== "user") return databaseRole;

  const metadata = typeof metadataRole === "string" ? metadataRole.toLowerCase() : "";
  if (metadata === "admin") return "admin";
  if (metadata === "moderator") return "moderator";
  return "user";
}

function coerceDisplayName(input: { displayName: string | null | undefined; email: string | null | undefined; fallback: string }): string {
  return input.displayName?.trim() || input.email?.trim() || input.fallback;
}

export async function requireAdminAccess(): Promise<{ ok: true; requesterId: string; requesterRole: AdminUserRole } | { ok: false; status: number; error: string }> {
  const access = await getModerationAccess();
  if (!access.userId) {
    return { ok: false, status: 401, error: "Sign in to continue." };
  }
  if (!access.isModerator) {
    return { ok: false, status: 403, error: "Admin access is required." };
  }
  return { ok: true, requesterId: access.userId, requesterRole: access.role };
}

export async function listAdminUsers(): Promise<{ ok: true; users: AdminUserSummary[] } | { ok: false; error: string }> {
  const service = createServiceSupabaseClient();
  if (!service) {
    return { ok: false, error: "Supabase service role key is not configured." };
  }

  const collected: Array<{ id: string; email: string | null; provider: string | null; appRole: string | null; displayName: string | null }> = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) {
      return { ok: false, error: error.message };
    }
    const users = data?.users ?? [];
    for (const user of users) {
      collected.push({
        id: user.id,
        email: user.email ?? null,
        provider: typeof user.app_metadata?.provider === "string" ? user.app_metadata.provider : null,
        appRole: typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null,
        displayName:
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : typeof user.user_metadata?.name === "string"
              ? user.user_metadata.name
              : null
      });
    }

    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  const userIds = collected.map((entry) => entry.id);
  const { data: profiles } = await service
    .from("user_profiles")
    .select("user_id, display_name, email, provider, role, last_active_at")
    .in("user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const { data: drillCounts } = await service
    .from("hosted_drafts")
    .select("owner_user_id")
    .in("owner_user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const { data: publicationCounts } = await service
    .from("exchange_publications")
    .select("owner_user_id, visibility_status")
    .in("owner_user_id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  const profileById = new Map((profiles ?? []).map((row) => [row.user_id, row]));
  const authoredCountByUser = new Map<string, number>();
  for (const row of drillCounts ?? []) {
    authoredCountByUser.set(row.owner_user_id, (authoredCountByUser.get(row.owner_user_id) ?? 0) + 1);
  }

  const publishedCountByUser = new Map<string, number>();
  for (const row of publicationCounts ?? []) {
    if (row.visibility_status !== "published") continue;
    publishedCountByUser.set(row.owner_user_id, (publishedCountByUser.get(row.owner_user_id) ?? 0) + 1);
  }

  const users: AdminUserSummary[] = collected.map((entry) => {
    const profile = profileById.get(entry.id);
    const displayName = coerceDisplayName({
      displayName: profile?.display_name ?? entry.displayName,
      email: profile?.email ?? entry.email,
      fallback: entry.id.slice(0, 8)
    });

    return {
      userId: entry.id,
      email: profile?.email ?? entry.email,
      displayName,
      provider: profile?.provider ?? entry.provider,
      role: coerceRoleFromSources(profile?.role, entry.appRole),
      lastActiveAtIso: profile?.last_active_at ?? null,
      authoredDrillCount: authoredCountByUser.get(entry.id) ?? 0,
      publishedDrillCount: publishedCountByUser.get(entry.id) ?? 0
    };
  });

  users.sort((a, b) => {
    if (a.lastActiveAtIso && b.lastActiveAtIso) return b.lastActiveAtIso.localeCompare(a.lastActiveAtIso);
    if (a.lastActiveAtIso) return -1;
    if (b.lastActiveAtIso) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return { ok: true, users };
}

export async function countAdmins(): Promise<number> {
  const service = createServiceSupabaseClient();
  if (!service) return 0;
  const { count } = await service.from("user_profiles").select("user_id", { count: "exact", head: true }).eq("role", "admin");
  return count ?? 0;
}
