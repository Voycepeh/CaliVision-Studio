import type { AuthSession } from "@/lib/auth/supabase-auth";

export type SessionPersistenceMode = "local" | "cloud";

export function resolveSessionPersistenceMode(input: {
  session: AuthSession | null;
  isSupabaseConfigured: boolean;
}): SessionPersistenceMode {
  return input.session && input.isSupabaseConfigured ? "cloud" : "local";
}

export function isCloudMode(input: { session: AuthSession | null; isSupabaseConfigured: boolean }): boolean {
  return resolveSessionPersistenceMode(input) === "cloud";
}
