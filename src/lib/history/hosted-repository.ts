import { getSupabasePublicEnv } from "../supabase/public-env.ts";
import type { AttemptHistoryRepository, AttemptHistorySession } from "./repository.ts";
import type { SavedAttemptSummary } from "./types";

export type AttemptSummaryRow = {
  id: string;
  owner_user_id: string;
  client_attempt_id: string | null;
  created_at: string;
  source: "upload" | "live";
  drill_id: string | null;
  drill_version: string | null;
  drill_title: string;
  movement_type: "REP" | "HOLD" | "unknown";
  duration_seconds: number | null;
  reps_counted: number | null;
  reps_incomplete: number | null;
  longest_hold_seconds: number | null;
  total_hold_seconds: number | null;
  common_failure_reason: string | null;
  main_finding: string | null;
  status: "completed" | "partial" | "failed" | "degraded";
  analysis_model_version: string;
  inserted_at: string;
  updated_at: string;
};

type AttemptSummaryInsertRow = Omit<AttemptSummaryRow, "id" | "inserted_at" | "updated_at">;

type PostgrestErrorPayload = {
  message?: string;
  details?: string | null;
  hint?: string | null;
  code?: string;
};

function headers(session: AttemptHistorySession): HeadersInit {
  const env = getSupabasePublicEnv();
  return {
    "Content-Type": "application/json",
    apikey: env?.publishableKey ?? "",
    Authorization: `Bearer ${session.accessToken}`
  };
}

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

function logHostedHistoryFailure(operation: string, detail: string): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`[attempt-history] ${operation} failed: ${detail}`);
  }
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}



function buildAttemptIdFilter(attemptId: string): string {
  const encodedAttemptId = encodeURIComponent(attemptId);
  return isUuid(attemptId)
    ? `or=(client_attempt_id.eq.${encodedAttemptId},id.eq.${encodedAttemptId})`
    : `client_attempt_id=eq.${encodedAttemptId}`;
}

export function mapAttemptSummaryToInsertRow(attempt: SavedAttemptSummary, ownerUserId: string): AttemptSummaryInsertRow {
  return {
    owner_user_id: ownerUserId,
    client_attempt_id: attempt.id,
    created_at: attempt.createdAt,
    source: attempt.source,
    drill_id: attempt.drillId ?? null,
    drill_version: attempt.drillVersion ?? null,
    drill_title: attempt.drillTitle,
    movement_type: attempt.movementType,
    duration_seconds: attempt.durationSeconds ?? null,
    reps_counted: attempt.repsCounted ?? null,
    reps_incomplete: attempt.repsIncomplete ?? null,
    longest_hold_seconds: attempt.longestHoldSeconds ?? null,
    total_hold_seconds: attempt.totalHoldSeconds ?? null,
    common_failure_reason: attempt.commonFailureReason ?? null,
    main_finding: attempt.mainFinding ?? null,
    status: attempt.status,
    analysis_model_version: attempt.analysisModelVersion
  };
}

export function mapAttemptSummaryRowToSavedAttempt(row: AttemptSummaryRow): SavedAttemptSummary {
  return {
    id: row.client_attempt_id ?? row.id,
    createdAt: row.created_at,
    source: row.source,
    drillId: row.drill_id ?? undefined,
    drillVersion: row.drill_version ?? undefined,
    drillTitle: row.drill_title,
    movementType: row.movement_type,
    durationSeconds: row.duration_seconds ?? undefined,
    repsCounted: row.reps_counted ?? undefined,
    repsIncomplete: row.reps_incomplete ?? undefined,
    longestHoldSeconds: row.longest_hold_seconds ?? undefined,
    totalHoldSeconds: row.total_hold_seconds ?? undefined,
    commonFailureReason: row.common_failure_reason ?? undefined,
    mainFinding: row.main_finding ?? undefined,
    status: row.status,
    analysisModelVersion: row.analysis_model_version
  };
}

export class SupabaseAttemptHistoryRepository implements AttemptHistoryRepository {
  private readonly session: AttemptHistorySession;

  constructor(session: AttemptHistorySession) {
    this.session = session;
  }

  private get env() {
    return getSupabasePublicEnv();
  }

  async saveAttempt(attempt: SavedAttemptSummary): Promise<void> {
    const env = this.env;
    if (!env) throw new Error("Supabase is not configured.");

    const payload = mapAttemptSummaryToInsertRow(attempt, this.session.user.id);

    const response = await fetch(`${env.url}/rest/v1/attempt_summaries?on_conflict=owner_user_id,client_attempt_id`, {
      method: "POST",
      headers: {
        ...headers(this.session),
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const backendError = await readBackendError(response);
      logHostedHistoryFailure("save", backendError);
      throw new Error(`Failed to save hosted attempt summary: ${backendError}`);
    }
  }

  async listRecentAttempts(limit = 100): Promise<SavedAttemptSummary[]> {
    const env = this.env;
    if (!env) throw new Error("Supabase is not configured.");

    const response = await fetch(
      `${env.url}/rest/v1/attempt_summaries?select=*&order=created_at.desc&limit=${encodeURIComponent(String(limit))}`,
      { headers: headers(this.session) }
    );

    if (!response.ok) {
      const backendError = await readBackendError(response);
      logHostedHistoryFailure("listRecent", backendError);
      throw new Error(`Failed to read hosted attempt summaries: ${backendError}`);
    }

    const rows = (await response.json()) as AttemptSummaryRow[];
    return rows.map(mapAttemptSummaryRowToSavedAttempt);
  }

  async listAttemptsByDrill(drillId: string, limit = 100): Promise<SavedAttemptSummary[]> {
    const env = this.env;
    if (!env) throw new Error("Supabase is not configured.");

    const response = await fetch(
      `${env.url}/rest/v1/attempt_summaries?select=*&drill_id=eq.${encodeURIComponent(drillId)}&order=created_at.desc&limit=${encodeURIComponent(String(limit))}`,
      { headers: headers(this.session) }
    );

    if (!response.ok) {
      const backendError = await readBackendError(response);
      logHostedHistoryFailure("listByDrill", backendError);
      throw new Error(`Failed to read hosted attempt summaries: ${backendError}`);
    }

    const rows = (await response.json()) as AttemptSummaryRow[];
    return rows.map(mapAttemptSummaryRowToSavedAttempt);
  }

  async getAttempt(attemptId: string): Promise<SavedAttemptSummary | null> {
    const env = this.env;
    if (!env) throw new Error("Supabase is not configured.");

    const response = await fetch(
      `${env.url}/rest/v1/attempt_summaries?select=*&${buildAttemptIdFilter(attemptId)}&order=created_at.desc&limit=1`,
      { headers: headers(this.session) }
    );

    if (!response.ok) {
      const backendError = await readBackendError(response);
      logHostedHistoryFailure("getAttempt", backendError);
      throw new Error(`Failed to read hosted attempt summary: ${backendError}`);
    }

    const rows = (await response.json()) as AttemptSummaryRow[];
    return rows[0] ? mapAttemptSummaryRowToSavedAttempt(rows[0]) : null;
  }

  async deleteAttempt(attemptId: string): Promise<boolean> {
    const env = this.env;
    if (!env) throw new Error("Supabase is not configured.");

    const response = await fetch(`${env.url}/rest/v1/attempt_summaries?${buildAttemptIdFilter(attemptId)}`, {
      method: "DELETE",
      headers: {
        ...headers(this.session),
        Prefer: "return=representation"
      }
    });

    if (!response.ok) {
      const backendError = await readBackendError(response);
      logHostedHistoryFailure("delete", backendError);
      throw new Error(`Failed to delete hosted attempt summary: ${backendError}`);
    }

    const rows = (await response.json()) as AttemptSummaryRow[];
    return rows.length > 0;
  }

  async clearAttempts(): Promise<void> {
    const env = this.env;
    if (!env) throw new Error("Supabase is not configured.");

    const response = await fetch(`${env.url}/rest/v1/attempt_summaries?owner_user_id=eq.${encodeURIComponent(this.session.user.id)}`, {
      method: "DELETE",
      headers: headers(this.session)
    });

    if (!response.ok) {
      const backendError = await readBackendError(response);
      logHostedHistoryFailure("clear", backendError);
      throw new Error(`Failed to clear hosted attempt summaries: ${backendError}`);
    }
  }
}
