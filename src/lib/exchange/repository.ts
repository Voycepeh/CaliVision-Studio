import type { AuthSession } from "@/lib/auth/supabase-auth";
import type { DrillVersionSnapshot } from "@/lib/library";
import type { DrillPackage } from "@/lib/schema/contracts";
import { getSupabasePublicEnv } from "@/lib/supabase/public-env";

export type ExchangeVisibility = "public";
export type ExchangeVisibilityStatus = "published" | "hidden" | "archived" | "deleted";
export type ExchangeModerationAction = "hide" | "archive" | "delete";

export type ExchangePublication = {
  id: string;
  sourceDrillId: string;
  sourceVersionId: string;
  ownerUserId: string;
  creatorDisplayName: string;
  title: string;
  slug: string;
  shortDescription: string;
  fullDescription: string | null;
  movementType: string;
  cameraView: string;
  difficultyLevel: string;
  category: string;
  equipment: string | null;
  tags: string[];
  visibility: ExchangeVisibility;
  visibilityStatus: ExchangeVisibilityStatus;
  snapshotPackage: DrillPackage;
  publishedAtIso: string;
  updatedAtIso: string;
  forkCount: number;
  isActive: boolean;
  moderationReason: string | null;
  moderatedBy: string | null;
  moderatedAtIso: string | null;
};

export type ExchangeForkRecord = {
  publishedDrillId: string;
  forkedPrivateDrillId: string;
  forkedByUserId: string;
  createdAtIso: string;
};

type ExchangePublicationRow = {
  id: string;
  source_drill_id: string;
  source_version_id: string;
  owner_user_id: string;
  creator_display_name: string;
  title: string;
  slug: string;
  short_description: string;
  full_description: string | null;
  movement_type: string;
  camera_view: string;
  difficulty_level: string;
  category: string;
  equipment: string | null;
  tags: string[] | null;
  visibility: ExchangeVisibility;
  visibility_status: ExchangeVisibilityStatus;
  snapshot_package: DrillPackage;
  published_at: string;
  updated_at: string;
  fork_count: number;
  is_active: boolean;
  moderation_reason: string | null;
  moderated_by: string | null;
  moderated_at: string | null;
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
type ExchangeForkRow = {
  published_drill_id: string;
  forked_private_drill_id: string;
  forked_by_user_id: string;
  created_at: string;
};

type PublishExchangeInput = {
  sourceVersion: DrillVersionSnapshot;
  creatorDisplayName: string;
  metadata: {
    title: string;
    shortDescription: string;
    fullDescription?: string;
    category: string;
    difficulty?: string;
    equipment?: string;
    tags: string[];
  };
};

function mapRow(row: ExchangePublicationRow): ExchangePublication {
  return {
    id: row.id,
    sourceDrillId: row.source_drill_id,
    sourceVersionId: row.source_version_id,
    ownerUserId: row.owner_user_id,
    creatorDisplayName: row.creator_display_name,
    title: row.title,
    slug: row.slug,
    shortDescription: row.short_description,
    fullDescription: row.full_description,
    movementType: row.movement_type,
    cameraView: row.camera_view,
    difficultyLevel: row.difficulty_level,
    category: row.category,
    equipment: row.equipment,
    tags: row.tags ?? [],
    visibility: row.visibility,
    visibilityStatus: row.visibility_status,
    snapshotPackage: row.snapshot_package,
    publishedAtIso: row.published_at,
    updatedAtIso: row.updated_at,
    forkCount: row.fork_count,
    isActive: row.is_active,
    moderationReason: row.moderation_reason,
    moderatedBy: row.moderated_by,
    moderatedAtIso: row.moderated_at
  };
}

function headers(session?: AuthSession | null): HeadersInit {
  const env = getSupabasePublicEnv();
  if (!env) return { "Content-Type": "application/json" };
  return {
    "Content-Type": "application/json",
    apikey: env.publishableKey,
    ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {})
  };
}

async function readBackendError(response: Response): Promise<string> {
  const fallback = `Request failed (${response.status})`;
  try {
    const payload = (await response.json()) as { message?: string; details?: string | null; hint?: string | null; code?: string };
    const parts = [payload?.message, payload?.details, payload?.hint, payload?.code ? `code=${payload.code}` : null].filter(Boolean);
    return parts.length > 0 ? parts.join(" | ") : fallback;
  } catch {
    return fallback;
  }
}

async function readBackendErrorPayload(response: Response): Promise<{ message: string; code?: string }> {
  const fallback = { message: `Request failed (${response.status})` };
  try {
    const payload = (await response.json()) as { message?: string; details?: string | null; hint?: string | null; code?: string };
    const parts = [payload?.message, payload?.details, payload?.hint, payload?.code ? `code=${payload.code}` : null].filter(Boolean);
    return {
      message: parts.length > 0 ? parts.join(" | ") : fallback.message,
      code: payload?.code
    };
  } catch {
    return fallback;
  }
}

function isMissingExchangeForksTable(message: string, code?: string): boolean {
  return code === "PGRST205" || /exchange_forks/i.test(message) && /schema cache|does not exist|relation/i.test(message);
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

function trimOrFallback(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function dedupeByCanonicalDrill(rows: ExchangePublication[]): ExchangePublication[] {
  const byOwnerAndDrill = new Map<string, ExchangePublication>();
  for (const publication of rows) {
    const key = `${publication.ownerUserId}:${publication.sourceDrillId}`;
    if (!byOwnerAndDrill.has(key)) {
      byOwnerAndDrill.set(key, publication);
    }
  }
  return [...byOwnerAndDrill.values()];
}

function buildDiscoveryQuery(params: { movementType?: string; difficulty?: string; category?: string }): string {
  const query = new URLSearchParams({
    select: "*",
    is_active: "eq.true",
    visibility_status: "eq.published",
    order: "published_at.desc"
  });

  if (params.movementType && params.movementType !== "all") {
    query.set("movement_type", `eq.${params.movementType}`);
  }
  if (params.difficulty && params.difficulty !== "all") {
    query.set("difficulty_level", `eq.${params.difficulty}`);
  }
  if (params.category && params.category !== "all") {
    query.set("category", `eq.${params.category}`);
  }

  return query.toString();
}

async function resolveUniqueSlug(baseSlug: string, session: AuthSession): Promise<Result<string>> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const base = baseSlug || "published-drill";
  const response = await fetch(`${env.url}/rest/v1/exchange_publications?select=slug&slug=like.${encodeURIComponent(`${base}%`)}`, {
    headers: headers(session)
  });
  if (!response.ok) {
    return { ok: false, error: `Failed to check slug uniqueness: ${await readBackendError(response)}` };
  }

  const rows = (await response.json()) as Array<{ slug: string }>;
  const existing = new Set(rows.map((row) => row.slug));
  if (!existing.has(base)) {
    return { ok: true, value: base };
  }

  for (let index = 2; index < 500; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existing.has(candidate)) {
      return { ok: true, value: candidate };
    }
  }

  return { ok: false, error: "Could not generate a unique Exchange slug." };
}

export async function publishDrillToExchange(session: AuthSession, input: PublishExchangeInput): Promise<Result<ExchangePublication>> {
  if (input.sourceVersion.status !== "ready") {
    return { ok: false, error: "Only Ready versions can be published to Drill Exchange." };
  }

  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const drill = input.sourceVersion.packageJson.drills[0];
  const baseTitle = trimOrFallback(input.metadata.title, drill?.title ?? "Untitled drill");
  const existingResponse = await fetch(
    `${env.url}/rest/v1/exchange_publications?select=id,slug&owner_user_id=eq.${encodeURIComponent(session.user.id)}&source_drill_id=eq.${encodeURIComponent(input.sourceVersion.drillId)}&order=updated_at.desc&limit=1`,
    { headers: headers(session) }
  );
  if (!existingResponse.ok) {
    return { ok: false, error: `Failed to load existing publication state: ${await readBackendError(existingResponse)}` };
  }
  const existingRows = (await existingResponse.json()) as Array<{ id: string; slug: string }>;
  const uniqueSlug = existingRows[0]?.slug
    ? ({ ok: true, value: existingRows[0].slug } as const)
    : await resolveUniqueSlug(toSlug(baseTitle), session);
  if (!uniqueSlug.ok) return uniqueSlug;

  const snapshotPackage = structuredClone(input.sourceVersion.packageJson);
  snapshotPackage.manifest.publishing = {
    ...(snapshotPackage.manifest.publishing ?? {}),
    publishStatus: "published",
    title: baseTitle,
    summary: trimOrFallback(input.metadata.shortDescription, drill?.description ?? "Published drill"),
    description: input.metadata.fullDescription?.trim() || undefined,
    tags: input.metadata.tags,
    categories: [trimOrFallback(input.metadata.category, "General")],
    authorDisplayName: trimOrFallback(input.creatorDisplayName, "Studio creator"),
    visibility: "public"
  };

  const payload = {
    source_drill_id: input.sourceVersion.drillId,
    source_version_id: input.sourceVersion.versionId,
    creator_display_name: trimOrFallback(input.creatorDisplayName, "Studio creator"),
    title: baseTitle,
    slug: uniqueSlug.value,
    short_description: trimOrFallback(input.metadata.shortDescription, drill?.description ?? "Published drill"),
    full_description: input.metadata.fullDescription?.trim() || null,
    movement_type: drill?.drillType ?? "rep",
    camera_view: drill?.primaryView ?? "front",
    difficulty_level: input.metadata.difficulty?.trim() || drill?.difficulty || "beginner",
    category: trimOrFallback(input.metadata.category, "General"),
    equipment: input.metadata.equipment?.trim() || null,
    tags: input.metadata.tags,
    visibility: "public",
    visibility_status: "published",
    snapshot_package: snapshotPackage,
    is_active: true,
    moderation_reason: null,
    moderated_by: null,
    moderated_at: null
  };

  const response = await fetch(`${env.url}/rest/v1/exchange_publications?on_conflict=owner_user_id,source_drill_id`, {
    method: "POST",
    headers: {
      ...headers(session),
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return { ok: false, error: `Failed to publish drill to Exchange: ${await readBackendError(response)}` };
  }

  const rows = (await response.json()) as ExchangePublicationRow[];
  if (!rows[0]) {
    return { ok: false, error: "Exchange publish returned no publication row." };
  }

  return { ok: true, value: mapRow(rows[0]) };
}

export async function findExistingExchangeFork(session: AuthSession, publishedDrillId: string): Promise<Result<ExchangeForkRecord | null>> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const response = await fetch(
    `${env.url}/rest/v1/exchange_forks?select=*&published_drill_id=eq.${encodeURIComponent(publishedDrillId)}&forked_by_user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`,
    { headers: headers(session) }
  );
  if (!response.ok) {
    const backend = await readBackendErrorPayload(response);
    if (isMissingExchangeForksTable(backend.message, backend.code)) {
      return { ok: true, value: null };
    }
    return { ok: false, error: `Failed to check existing fork lineage: ${backend.message}` };
  }

  const rows = (await response.json()) as ExchangeForkRow[];
  const row = rows[0];
  if (!row) {
    return { ok: true, value: null };
  }
  return {
    ok: true,
    value: {
      publishedDrillId: row.published_drill_id,
      forkedPrivateDrillId: row.forked_private_drill_id,
      forkedByUserId: row.forked_by_user_id,
      createdAtIso: row.created_at
    }
  };
}

export async function listExchangePublications(params: {
  searchText?: string;
  movementType?: string;
  difficulty?: string;
  category?: string;
  session?: AuthSession | null;
}): Promise<Result<ExchangePublication[]>> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const response = await fetch(`${env.url}/rest/v1/exchange_publications?${buildDiscoveryQuery(params)}`, {
    headers: headers(params.session)
  });

  if (!response.ok) {
    return { ok: false, error: `Failed to load Drill Exchange: ${await readBackendError(response)}` };
  }

  const rows = (await response.json()) as ExchangePublicationRow[];
  const search = params.searchText?.trim().toLowerCase();
  const filtered = dedupeByCanonicalDrill(rows
    .map(mapRow)
    .filter((row) =>
      !search
        ? true
        : [row.title, row.shortDescription, row.creatorDisplayName, ...row.tags]
            .join(" ")
            .toLowerCase()
            .includes(search)
    ));

  return { ok: true, value: filtered };
}

export async function getExchangePublicationBySlug(slug: string, session?: AuthSession | null): Promise<Result<ExchangePublication | null>> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const response = await fetch(
    `${env.url}/rest/v1/exchange_publications?select=*&slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&visibility_status=eq.published&limit=1`,
    {
    headers: headers(session)
    }
  );

  if (!response.ok) {
    return { ok: false, error: `Failed to load published drill detail: ${await readBackendError(response)}` };
  }

  const rows = (await response.json()) as ExchangePublicationRow[];
  return { ok: true, value: rows[0] ? mapRow(rows[0]) : null };
}

export async function listMyExchangePublications(session: AuthSession): Promise<Result<ExchangePublication[]>> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const response = await fetch(`${env.url}/rest/v1/exchange_publications?select=*&owner_user_id=eq.${encodeURIComponent(session.user.id)}&order=updated_at.desc`, {
    headers: headers(session)
  });

  if (!response.ok) {
    return { ok: false, error: `Failed to load your Exchange publications: ${await readBackendError(response)}` };
  }

  const rows = (await response.json()) as ExchangePublicationRow[];
  return { ok: true, value: dedupeByCanonicalDrill(rows.map(mapRow)) };
}

export async function removeOwnPublicationFromPublic(
  session: AuthSession,
  input: { publicationId: string; nextStatus?: Extract<ExchangeVisibilityStatus, "hidden" | "archived"> }
): Promise<Result<ExchangePublication>> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const response = await fetch(`${env.url}/rest/v1/exchange_publications?id=eq.${encodeURIComponent(input.publicationId)}`, {
    method: "PATCH",
    headers: {
      ...headers(session),
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      visibility_status: input.nextStatus ?? "archived",
      is_active: true
    })
  });

  if (!response.ok) {
    return { ok: false, error: `Failed to remove publication from Drill Exchange: ${await readBackendError(response)}` };
  }

  const rows = (await response.json()) as ExchangePublicationRow[];
  if (!rows[0]) {
    return { ok: false, error: "Publication was not updated." };
  }
  return { ok: true, value: mapRow(rows[0]) };
}

export async function getExchangeModerationAccess(): Promise<Result<{ isModerator: boolean }>> {
  const response = await fetch("/api/exchange/moderation-access", { method: "GET" });
  if (!response.ok) {
    return { ok: false, error: `Failed to resolve moderation access (${response.status})` };
  }
  const payload = (await response.json()) as { isModerator?: boolean };
  return { ok: true, value: { isModerator: payload.isModerator === true } };
}

export async function moderateExchangePublication(
  publicationId: string,
  input: { action: ExchangeModerationAction; reason?: string }
): Promise<Result<ExchangeVisibilityStatus>> {
  const response = await fetch(`/api/exchange/publications/${encodeURIComponent(publicationId)}/moderate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: payload.error || `Failed to moderate publication (${response.status})` };
  }

  const payload = (await response.json()) as { visibilityStatus?: ExchangeVisibilityStatus };
  if (!payload.visibilityStatus) {
    return { ok: false, error: "Moderation completed without a status response." };
  }
  return { ok: true, value: payload.visibilityStatus };
}

export async function recordExchangeFork(
  session: AuthSession,
  input: { publishedDrillId: string; forkedPrivateDrillId: string }
): Promise<Result<void>> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const response = await fetch(`${env.url}/rest/v1/exchange_forks`, {
    method: "POST",
    headers: {
      ...headers(session),
      Prefer: "resolution=ignore-duplicates"
    },
    body: JSON.stringify({
      published_drill_id: input.publishedDrillId,
      forked_private_drill_id: input.forkedPrivateDrillId,
      forked_by_user_id: session.user.id
    })
  });

  if (!response.ok) {
    const backend = await readBackendErrorPayload(response);
    if (isMissingExchangeForksTable(backend.message, backend.code)) {
      return { ok: false, error: "Fork lineage table is not available yet. Apply latest Supabase migrations and retry." };
    }
    return { ok: false, error: `Failed to save fork lineage: ${backend.message}` };
  }

  return { ok: true, value: undefined };
}

export async function updateExchangeForkTarget(
  session: AuthSession,
  input: { publishedDrillId: string; forkedPrivateDrillId: string }
): Promise<Result<void>> {
  const env = getSupabasePublicEnv();
  if (!env) return { ok: false, error: "Supabase is not configured." };

  const response = await fetch(
    `${env.url}/rest/v1/exchange_forks?published_drill_id=eq.${encodeURIComponent(input.publishedDrillId)}&forked_by_user_id=eq.${encodeURIComponent(session.user.id)}`,
    {
      method: "PATCH",
      headers: headers(session),
      body: JSON.stringify({
        forked_private_drill_id: input.forkedPrivateDrillId
      })
    }
  );

  if (!response.ok) {
    const backend = await readBackendErrorPayload(response);
    if (isMissingExchangeForksTable(backend.message, backend.code)) {
      return { ok: false, error: "Fork lineage table is not available yet. Apply latest Supabase migrations and retry." };
    }
    return { ok: false, error: `Failed to update fork lineage target: ${backend.message}` };
  }

  return { ok: true, value: undefined };
}
