import type { AuthSession } from "@/lib/auth/supabase-auth";
import { getSupabasePublicEnv } from "@/lib/supabase/public-env";

export async function uploadHostedDraftAsset(input: {
  session: AuthSession;
  draftId: string;
  assetId: string;
  file: Blob;
}): Promise<{ ok: boolean; path?: string; error?: string }> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const extension = input.file.type.includes("png") ? "png" : "jpg";
  const path = `${input.session.user.id}/${input.draftId}/${input.assetId}.${extension}`;
  const response = await fetch(`${env.url}/storage/v1/object/draft-assets/${path}`, {
    method: "POST",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${input.session.accessToken}`,
      "Content-Type": input.file.type || "application/octet-stream",
      "x-upsert": "true"
    },
    body: input.file
  });

  if (!response.ok) {
    return { ok: false, error: "Failed to upload hosted asset." };
  }

  return { ok: true, path };
}
