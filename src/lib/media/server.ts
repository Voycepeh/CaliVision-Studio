import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { HomepageBrandingImage, MediaAssetRecord } from "@/lib/media/types";

const HOMEPAGE_BRANDING_LIMIT = 12;

function buildPublicMediaUrl(bucket: string, path: string): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!baseUrl) return null;
  return `${baseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

function normalizeBrandingAsset(record: MediaAssetRecord): HomepageBrandingImage | null {
  const src = buildPublicMediaUrl(record.bucket, record.path);
  if (!src) return null;

  return {
    id: record.id,
    src,
    alt: record.alt_text?.trim() || record.title?.trim() || "CaliVision branding image",
    title: record.title,
    width: record.width,
    height: record.height,
    order: record.display_order
  };
}

export async function getHomepageBrandingImages(): Promise<HomepageBrandingImage[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("media_assets")
    .select("id, bucket, path, kind, scope, owner_user_id, title, alt_text, mime_type, file_size_bytes, width, height, duration_ms, display_order, tags, is_public, is_active, created_at, updated_at")
    .eq("scope", "branding")
    .eq("kind", "image")
    .eq("is_public", true)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(HOMEPAGE_BRANDING_LIMIT);

  if (error || !data) {
    return [];
  }

  return data
    .map((row) => normalizeBrandingAsset(row as MediaAssetRecord))
    .filter((row): row is HomepageBrandingImage => Boolean(row));
}
