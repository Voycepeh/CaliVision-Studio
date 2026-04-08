import type { AuthSession } from "@/lib/auth/supabase-auth";
import type { DrillPackage } from "@/lib/schema/contracts";
import { getSupabasePublicEnv } from "@/lib/supabase/public-env";

export type HostedLibraryItem = {
  id: string;
  packageId: string;
  packageVersion: string;
  title: string;
  summary: string;
  content: DrillPackage;
  createdAtIso: string;
  updatedAtIso: string;
};

type HostedLibraryRow = {
  id: string;
  owner_user_id: string;
  package_id: string;
  package_version: string;
  title: string;
  summary: string;
  content: DrillPackage;
  created_at: string;
  updated_at: string;
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function headers(session: AuthSession): HeadersInit {
  const env = getSupabasePublicEnv();
  return {
    "Content-Type": "application/json",
    apikey: env?.publishableKey ?? "",
    Authorization: `Bearer ${session.accessToken}`
  };
}

function mapRow(row: HostedLibraryRow): HostedLibraryItem {
  return {
    id: row.id,
    packageId: row.package_id,
    packageVersion: row.package_version,
    title: row.title,
    summary: row.summary,
    content: row.content,
    createdAtIso: row.created_at,
    updatedAtIso: row.updated_at
  };
}

export async function listHostedLibrary(session: AuthSession): Promise<Result<HostedLibraryItem[]>> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const response = await fetch(`${env.url}/rest/v1/hosted_library?select=*&order=updated_at.desc`, {
    headers: headers(session)
  });
  if (!response.ok) return { ok: false, error: "Failed to load hosted library." };

  const rows = (await response.json()) as HostedLibraryRow[];
  return { ok: true, value: rows.map(mapRow) };
}

export async function upsertHostedLibraryItem(
  session: AuthSession,
  packageJson: DrillPackage
): Promise<Result<HostedLibraryItem>> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const payload = {
    package_id: packageJson.manifest.packageId,
    package_version: packageJson.manifest.packageVersion,
    title: packageJson.drills[0]?.title ?? packageJson.manifest.packageId,
    summary: packageJson.drills[0]?.description ?? "Hosted drill",
    content: packageJson
  };

  const response = await fetch(`${env.url}/rest/v1/hosted_library`, {
    method: "POST",
    headers: {
      ...headers(session),
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) return { ok: false, error: "Failed to save hosted drill." };
  const rows = (await response.json()) as HostedLibraryRow[];
  if (!rows[0]) return { ok: false, error: "Hosted library save returned no row." };
  return { ok: true, value: mapRow(rows[0]) };
}

export async function deleteHostedLibraryItem(session: AuthSession, id: string): Promise<Result<void>> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const response = await fetch(`${env.url}/rest/v1/hosted_library?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers(session)
  });

  if (!response.ok) return { ok: false, error: "Failed to delete hosted drill." };
  return { ok: true, value: undefined };
}
