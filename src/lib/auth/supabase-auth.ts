import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type AuthUser = {
  id: string;
  email: string | null;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  user: AuthUser;
};

export function mapAuthSession(session: Session | null): AuthSession | null {
  if (!session?.user?.id || !session.access_token) {
    return null;
  }

  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    user: {
      id: session.user.id,
      email: session.user.email ?? null
    }
  };
}

export async function getActiveAuthSession(): Promise<AuthSession | null> {
  const client = createBrowserSupabaseClient();
  if (!client) return null;

  const { data } = await client.auth.getSession();
  return mapAuthSession(data.session);
}

export async function signInWithGoogle(returnTo: string): Promise<{ ok: boolean; error?: string }> {
  const client = createBrowserSupabaseClient();
  if (!client || typeof window === "undefined") {
    return { ok: false, error: "Supabase is not configured." };
  }

  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`;
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo }
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function signOutRemote(): Promise<void> {
  const client = createBrowserSupabaseClient();
  if (!client) return;

  await client.auth.signOut();
}
