import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { MediaAssetRecord } from "@/lib/media/types";

export type BrandingAssetSummary = {
  id: string;
  title: string | null;
  altText: string | null;
  path: string;
  publicUrl: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
};

function buildPublicMediaUrl(bucket: string, path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!baseUrl) {
    return "";
  }
  return `${baseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

function normalizeBrandingAsset(record: MediaAssetRecord): BrandingAssetSummary {
  return {
    id: record.id,
    title: record.title,
    altText: record.alt_text,
    path: record.path,
    publicUrl: buildPublicMediaUrl(record.bucket, record.path),
    displayOrder: record.display_order,
    isActive: record.is_active,
    createdAt: record.created_at
  };
}

function sanitizeFilename(filename: string): string {
  const extension = filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1).toLowerCase() : "bin";
  const stem = filename.replace(/\.[^/.]+$/, "").toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "asset";
  return `${stem}.${extension}`;
}

export async function listBrandingAssets(): Promise<{ ok: true; assets: BrandingAssetSummary[] } | { ok: false; error: string }> {
  const service = createServiceSupabaseClient();
  if (!service) return { ok: false, error: "Supabase service role key is not configured." };

  const { data, error } = await service
    .from("media_assets")
    .select("id, bucket, path, kind, scope, owner_user_id, title, alt_text, mime_type, file_size_bytes, width, height, duration_ms, display_order, tags, is_public, is_active, created_at, updated_at")
    .eq("scope", "branding")
    .eq("kind", "image")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: error.message };

  return { ok: true, assets: (data ?? []).map((row) => normalizeBrandingAsset(row as MediaAssetRecord)) };
}

export async function uploadBrandingAsset(input: {
  file: File;
  title: string | null;
  altText: string | null;
  displayOrder: number;
  ownerUserId: string;
  width: number | null;
  height: number | null;
}): Promise<{ ok: true; asset: BrandingAssetSummary } | { ok: false; error: string }> {
  const service = createServiceSupabaseClient();
  if (!service) return { ok: false, error: "Supabase service role key is not configured." };

  const bytes = Buffer.from(await input.file.arrayBuffer());
  const now = Date.now();
  const objectPath = `${input.ownerUserId}/branding/${now}-${sanitizeFilename(input.file.name)}`;

  const upload = await service.storage.from("branding-assets").upload(objectPath, bytes, {
    contentType: input.file.type || "application/octet-stream",
    upsert: false
  });

  if (upload.error) return { ok: false, error: upload.error.message };

  const { data, error } = await service
    .from("media_assets")
    .insert({
      bucket: "branding-assets",
      path: objectPath,
      kind: "image",
      scope: "branding",
      owner_user_id: input.ownerUserId,
      title: input.title,
      alt_text: input.altText,
      mime_type: input.file.type || null,
      file_size_bytes: input.file.size,
      width: input.width,
      height: input.height,
      display_order: input.displayOrder,
      is_public: true,
      is_active: true,
      tags: []
    })
    .select("id, bucket, path, kind, scope, owner_user_id, title, alt_text, mime_type, file_size_bytes, width, height, duration_ms, display_order, tags, is_public, is_active, created_at, updated_at")
    .single();

  if (error || !data) {
    await service.storage.from("branding-assets").remove([objectPath]);
    return { ok: false, error: error?.message ?? "Failed to save media metadata." };
  }

  return { ok: true, asset: normalizeBrandingAsset(data as MediaAssetRecord) };
}

export async function updateBrandingAsset(
  id: string,
  patch: { title: string | null; altText: string | null; displayOrder: number; isActive: boolean }
): Promise<{ ok: true; asset: BrandingAssetSummary } | { ok: false; error: string }> {
  const service = createServiceSupabaseClient();
  if (!service) return { ok: false, error: "Supabase service role key is not configured." };

  const { data, error } = await service
    .from("media_assets")
    .update({
      title: patch.title,
      alt_text: patch.altText,
      display_order: patch.displayOrder,
      is_active: patch.isActive
    })
    .eq("id", id)
    .eq("scope", "branding")
    .select("id, bucket, path, kind, scope, owner_user_id, title, alt_text, mime_type, file_size_bytes, width, height, duration_ms, display_order, tags, is_public, is_active, created_at, updated_at")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Branding asset not found." };

  return { ok: true, asset: normalizeBrandingAsset(data as MediaAssetRecord) };
}

export async function deleteBrandingAsset(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = createServiceSupabaseClient();
  if (!service) return { ok: false, error: "Supabase service role key is not configured." };

  const { data: existing, error: fetchError } = await service
    .from("media_assets")
    .select("id, bucket, path")
    .eq("id", id)
    .eq("scope", "branding")
    .single();

  if (fetchError || !existing) return { ok: false, error: fetchError?.message ?? "Branding asset not found." };

  const storageDelete = await service.storage.from(existing.bucket).remove([existing.path]);
  if (storageDelete.error) return { ok: false, error: storageDelete.error.message };

  const { error } = await service.from("media_assets").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
