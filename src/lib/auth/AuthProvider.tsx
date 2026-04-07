"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  loadStoredSession,
  readSessionFromUrlFragment,
  sendMagicLink,
  signOutRemote,
  storeSession,
  type AuthSession
} from "@/lib/auth/supabase-auth";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";

type AuthContextValue = {
  isConfigured: boolean;
  session: AuthSession | null;
  userEmail: string | null;
  signInWithEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    const sessionFromUrl = readSessionFromUrlFragment();
    if (sessionFromUrl) {
      setSession(sessionFromUrl);
      storeSession(sessionFromUrl);
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      return;
    }

    setSession(loadStoredSession());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isConfigured: isSupabaseConfigured(),
      session,
      userEmail: session?.user.email ?? null,
      signInWithEmail: async (email: string) => sendMagicLink(email),
      signOut: async () => {
        if (session) {
          await signOutRemote(session.accessToken);
        }
        setSession(null);
        storeSession(null);
      }
    }),
    [session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
