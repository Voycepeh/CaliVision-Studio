"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { getActiveAuthSession, mapAuthSession, signInWithGoogle, signOutRemote, type AuthSession } from "@/lib/auth/supabase-auth";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";

type AuthContextValue = {
  isConfigured: boolean;
  session: AuthSession | null;
  userEmail: string | null;
  signInWithGoogle: () => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    let mounted = true;
    const client = createBrowserSupabaseClient();

    if (!client) {
      setSession(null);
      return;
    }

    void getActiveAuthSession().then((initialSession) => {
      if (!mounted) return;
      setSession(initialSession);
    });

    const {
      data: { subscription }
    } = client.auth.onAuthStateChange((_event: AuthChangeEvent, nextSession: Session | null) => {
      setSession(mapAuthSession(nextSession));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isConfigured: isSupabaseConfigured(),
      session,
      userEmail: session?.user.email ?? null,
      signInWithGoogle: async () => signInWithGoogle("/library"),
      signOut: async () => {
        await signOutRemote();
        setSession(null);
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
