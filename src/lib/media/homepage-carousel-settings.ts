import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export const HOMEPAGE_CAROUSEL_DURATION_DEFAULT_SECONDS = 7;
export const HOMEPAGE_CAROUSEL_DURATION_MIN_SECONDS = 2;
export const HOMEPAGE_CAROUSEL_DURATION_MAX_SECONDS = 30;

const SETTINGS_KEY = "homepage_branding_carousel_duration_seconds";

type HomepageSettingRecord = {
  setting_key: string;
  setting_value: number | null;
};

export function sanitizeHomepageCarouselDurationSeconds(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return HOMEPAGE_CAROUSEL_DURATION_DEFAULT_SECONDS;
  }
  const rounded = Math.round(numeric);
  if (rounded < HOMEPAGE_CAROUSEL_DURATION_MIN_SECONDS || rounded > HOMEPAGE_CAROUSEL_DURATION_MAX_SECONDS) {
    return HOMEPAGE_CAROUSEL_DURATION_DEFAULT_SECONDS;
  }
  return rounded;
}

export async function getHomepageCarouselDurationSeconds(): Promise<number> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return HOMEPAGE_CAROUSEL_DURATION_DEFAULT_SECONDS;

  const { data, error } = await supabase
    .from("app_settings")
    .select("setting_key, setting_value")
    .eq("setting_key", SETTINGS_KEY)
    .maybeSingle();

  if (error) return HOMEPAGE_CAROUSEL_DURATION_DEFAULT_SECONDS;

  const record = data as HomepageSettingRecord | null;
  return sanitizeHomepageCarouselDurationSeconds(record?.setting_value);
}

export async function getHomepageCarouselDurationSecondsForAdmin(): Promise<{ ok: true; seconds: number } | { ok: false; error: string }> {
  const service = createServiceSupabaseClient();
  if (!service) return { ok: false, error: "Supabase service role key is not configured." };

  const { data, error } = await service
    .from("app_settings")
    .select("setting_key, setting_value")
    .eq("setting_key", SETTINGS_KEY)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  const record = data as HomepageSettingRecord | null;
  return { ok: true, seconds: sanitizeHomepageCarouselDurationSeconds(record?.setting_value) };
}

export async function saveHomepageCarouselDurationSeconds(value: number): Promise<{ ok: true; seconds: number } | { ok: false; error: string }> {
  const service = createServiceSupabaseClient();
  if (!service) return { ok: false, error: "Supabase service role key is not configured." };

  const seconds = sanitizeHomepageCarouselDurationSeconds(value);
  const { error } = await service
    .from("app_settings")
    .upsert({ setting_key: SETTINGS_KEY, setting_value: seconds }, { onConflict: "setting_key" });

  if (error) return { ok: false, error: error.message };

  return { ok: true, seconds };
}
