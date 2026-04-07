import { getSupabasePublicEnv } from "@/lib/supabase/public-env";

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

const SESSION_KEY = "calivision.supabase.session";

export function loadStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function storeSession(session: AuthSession | null): void {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function readSessionFromUrlFragment(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const fragment = window.location.hash.replace(/^#/, "");
  if (!fragment) return null;

  const params = new URLSearchParams(fragment);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token") ?? "";
  const expiresIn = params.get("expires_in");
  const userId = params.get("user_id") ?? "";

  if (!accessToken || !userId) return null;

  const expiresAt = expiresIn ? Date.now() + Number(expiresIn) * 1000 : null;
  return {
    accessToken,
    refreshToken,
    expiresAt,
    user: {
      id: userId,
      email: params.get("email")
    }
  };
}

export async function signInWithGoogle(returnTo: string): Promise<{ ok: boolean; error?: string }> {
  const env = getSupabasePublicEnv();
  if (!env || typeof window === "undefined") {
    return { ok: false, error: "Supabase is not configured." };
  }

  const redirectTo = `${window.location.origin}${returnTo}`;
  const authorizeUrl = new URL(`${env.url}/auth/v1/authorize`);
  authorizeUrl.searchParams.set("provider", "google");
  authorizeUrl.searchParams.set("redirect_to", redirectTo);

  window.location.assign(authorizeUrl.toString());
  return { ok: true };
}

export async function signOutRemote(accessToken: string): Promise<void> {
  const env = getSupabasePublicEnv();
  if (!env) return;

  await fetch(`${env.url}/auth/v1/logout`, {
    method: "POST",
    headers: {
      apikey: env.publishableKey,
      Authorization: `Bearer ${accessToken}`
    }
  }).catch(() => undefined);
}
