"use client";

import { createBrowserClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "@/lib/supabase/public-env";

let browserClient: SupabaseClient | null = null;

export function createBrowserSupabaseClient(): SupabaseClient | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (browserClient) {
    return browserClient;
  }

  const env = getSupabasePublicEnv();
  if (!env) {
    return null;
  }

  browserClient = createBrowserClient(env.url, env.publishableKey, {
    cookies: {
      get(name: string) {
        const match = document.cookie
          .split("; ")
          .find((cookie) => cookie.startsWith(`${name}=`));
        return match ? decodeURIComponent(match.split("=")[1] ?? "") : undefined;
      },
      set(name: string, value: string, options: CookieOptions) {
        const cookie = `${name}=${encodeURIComponent(value)}; path=${options.path ?? "/"}`;
        document.cookie = cookie;
      },
      remove(name: string, options: CookieOptions) {
        document.cookie = `${name}=; Max-Age=0; path=${options.path ?? "/"}`;
      }
    }
  });

  return browserClient;
}
