export type SupabasePublicEnv = {
  url: string;
  publishableKey: string;
};

function readKey(): string | null {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (publishableKey) {
    return publishableKey;
  }

  const legacyAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return legacyAnonKey || null;
}

export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = readKey();

  if (!url || !publishableKey) {
    return null;
  }

  return { url, publishableKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicEnv() !== null;
}
