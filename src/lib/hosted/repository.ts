import type { DrillPackage } from "@/lib/schema/contracts";
import type { AuthSession } from "@/lib/auth/supabase-auth";
import { getSupabasePublicEnv } from "@/lib/supabase/public-env";
import type { HostedDraftRecord, HostedDraftSummary } from "@/lib/hosted/types";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

type HostedDraftRow = {
  id: string;
  owner_user_id: string;
  title: string;
  summary: string;
  status: "draft" | "ready";
  package_id: string;
  package_version: string;
  schema_version: string;
  revision: number;
  content: DrillPackage;
  updated_at: string;
};

function toSummary(row: HostedDraftRow): HostedDraftSummary {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    packageId: row.package_id,
    packageVersion: row.package_version,
    schemaVersion: row.schema_version,
    revision: row.revision,
    updatedAtIso: row.updated_at
  };
}

function headers(session: AuthSession): HeadersInit {
  const env = getSupabasePublicEnv();
  return {
    "Content-Type": "application/json",
    apikey: env?.anonKey ?? "",
    Authorization: `Bearer ${session.accessToken}`
  };
}

export async function listMyHostedDrafts(session: AuthSession): Promise<Result<HostedDraftSummary[]>> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const url = `${env.url}/rest/v1/hosted_drafts?select=*&order=updated_at.desc`;
  const response = await fetch(url, { headers: headers(session) });
  if (!response.ok) return { ok: false, error: "Failed to load hosted drafts." };
  const rows = (await response.json()) as HostedDraftRow[];
  return { ok: true, value: rows.map(toSummary) };
}

export async function loadHostedDraft(session: AuthSession, draftId: string): Promise<Result<HostedDraftRecord>> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const response = await fetch(`${env.url}/rest/v1/hosted_drafts?id=eq.${encodeURIComponent(draftId)}&select=*`, {
    headers: headers(session)
  });
  if (!response.ok) return { ok: false, error: "Failed to load hosted draft." };
  const rows = (await response.json()) as HostedDraftRow[];
  const row = rows[0];
  if (!row) return { ok: false, error: "Hosted draft not found." };

  return {
    ok: true,
    value: {
      ...toSummary(row),
      ownerUserId: row.owner_user_id,
      content: row.content
    }
  };
}

export async function upsertHostedDraft(
  session: AuthSession,
  input: { draftId?: string; packageJson: DrillPackage }
): Promise<Result<HostedDraftSummary>> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const pkg = input.packageJson;
  const payload = {
    id: input.draftId,
    title: pkg.drills[0]?.title ?? pkg.manifest.packageId,
    summary: pkg.drills[0]?.description ?? "Hosted drill draft",
    status: "draft",
    package_id: pkg.manifest.packageId,
    package_version: pkg.manifest.packageVersion,
    schema_version: pkg.manifest.schemaVersion,
    revision: pkg.manifest.versioning?.revision ?? 1,
    content: pkg
  };

  const response = await fetch(`${env.url}/rest/v1/hosted_drafts`, {
    method: "POST",
    headers: {
      ...headers(session),
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return { ok: false, error: "Hosted save failed." };
  }

  const rows = (await response.json()) as HostedDraftRow[];
  const row = rows[0];
  if (!row) return { ok: false, error: "Hosted save returned no draft." };

  return { ok: true, value: toSummary(row) };
}
