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

type PostgrestErrorPayload = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
};

async function readBackendError(response: Response): Promise<string> {
  const fallback = `Request failed (${response.status} ${response.statusText || "error"})`;

  try {
    const payload = (await response.json()) as PostgrestErrorPayload | null;
    if (!payload || typeof payload !== "object") {
      return fallback;
    }

    const message = payload.message?.trim();
    const details = payload.details?.trim();
    const hint = payload.hint?.trim();
    const code = payload.code?.trim();
    const parts = [message, details, hint, code ? `code=${code}` : null].filter(Boolean);
    return parts.length > 0 ? parts.join(" | ") : fallback;
  } catch {
    return fallback;
  }
}

function logHostedFailure(operation: string, detail: string): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`[hosted-drafts] ${operation} failed: ${detail}`);
  }
}

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
    apikey: env?.publishableKey ?? "",
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
    owner_user_id: session.user.id,
    title: pkg.drills[0]?.title ?? pkg.manifest.packageId,
    summary: pkg.drills[0]?.description ?? "Hosted drill draft",
    status: "draft",
    package_id: pkg.manifest.packageId,
    package_version: pkg.manifest.packageVersion,
    schema_version: pkg.manifest.schemaVersion,
    revision: pkg.manifest.versioning?.revision ?? 1,
    content: pkg
  };

  const response = await fetch(`${env.url}/rest/v1/hosted_drafts?on_conflict=owner_user_id,package_id,package_version`, {
    method: "POST",
    headers: {
      ...headers(session),
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const backendError = await readBackendError(response);
    logHostedFailure("save", backendError);
    return { ok: false, error: `Hosted save failed: ${backendError}` };
  }

  const rows = (await response.json()) as HostedDraftRow[];
  const row = rows[0];
  if (!row) return { ok: false, error: "Hosted save returned no draft." };

  return { ok: true, value: toSummary(row) };
}

export async function deleteHostedDraft(session: AuthSession, draftId: string): Promise<Result<void>> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const response = await fetch(`${env.url}/rest/v1/hosted_drafts?id=eq.${encodeURIComponent(draftId)}`, {
    method: "DELETE",
    headers: headers(session)
  });

  if (!response.ok) {
    const backendError = await readBackendError(response);
    logHostedFailure("delete", backendError);
    return { ok: false, error: `Failed to delete draft: ${backendError}` };
  }

  return { ok: true, value: undefined };
}
