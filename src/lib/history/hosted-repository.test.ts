import test from "node:test";
import assert from "node:assert/strict";
import type { AttemptHistorySession } from "./repository.ts";
import {
  mapAttemptSummaryRowToSavedAttempt,
  mapAttemptSummaryToInsertRow,
  SupabaseAttemptHistoryRepository,
  type AttemptSummaryRow
} from "./hosted-repository.ts";
import type { SavedAttemptSummary } from "./types";

function makeAttempt(overrides?: Partial<SavedAttemptSummary>): SavedAttemptSummary {
  return {
    id: "attempt_local_1",
    createdAt: "2026-04-26T11:00:00.000Z",
    source: "upload",
    drillId: "drill_pushup",
    drillVersion: "v2",
    drillTitle: "Push-up",
    movementType: "REP",
    durationSeconds: 12,
    repsCounted: 7,
    repsIncomplete: 1,
    commonFailureReason: "depth",
    mainFinding: "Keep chest lower",
    status: "partial",
    analysisModelVersion: "analysis-review-v1",
    ...overrides
  };
}

function makeSession(): AttemptHistorySession {
  return {
    accessToken: "token",
    refreshToken: "refresh",
    expiresAt: null,
    user: {
      id: "user-1",
      email: "demo@example.com"
    }
  };
}

test("mapAttemptSummaryToInsertRow maps SavedAttemptSummary into Supabase row payload", () => {
  const row = mapAttemptSummaryToInsertRow(makeAttempt(), "owner-1");
  assert.equal(row.owner_user_id, "owner-1");
  assert.equal(row.client_attempt_id, "attempt_local_1");
  assert.equal(row.created_at, "2026-04-26T11:00:00.000Z");
  assert.equal(row.drill_title, "Push-up");
  assert.equal(row.movement_type, "REP");
  assert.equal(row.reps_counted, 7);
});

test("mapAttemptSummaryRowToSavedAttempt prefers client_attempt_id for stable dedupe ids", () => {
  const row: AttemptSummaryRow = {
    id: "hosted-row-id",
    owner_user_id: "owner-1",
    client_attempt_id: "attempt_local_1",
    created_at: "2026-04-26T11:00:00.000Z",
    source: "live",
    drill_id: "drill_plank",
    drill_version: "v1",
    drill_title: "Plank",
    movement_type: "HOLD",
    duration_seconds: 45,
    reps_counted: null,
    reps_incomplete: null,
    longest_hold_seconds: 45,
    total_hold_seconds: 45,
    common_failure_reason: null,
    main_finding: "Great hold",
    status: "completed",
    analysis_model_version: "analysis-review-v1",
    inserted_at: "2026-04-26T11:00:00.000Z",
    updated_at: "2026-04-26T11:00:00.000Z"
  };

  const summary = mapAttemptSummaryRowToSavedAttempt(row);
  assert.equal(summary.id, "attempt_local_1");
  assert.equal(summary.source, "live");
  assert.equal(summary.longestHoldSeconds, 45);
  assert.equal(summary.mainFinding, "Great hold");
});

test("SupabaseAttemptHistoryRepository saveAttempt uses client_attempt_id upsert conflict key", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    return new Response(null, { status: 201 });
  }) as typeof fetch;

  try {
    const repository = new SupabaseAttemptHistoryRepository(makeSession());
    await repository.saveAttempt(makeAttempt());

    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0]?.url ?? "", /attempt_summaries\?on_conflict=owner_user_id,client_attempt_id/);

    const payload = JSON.parse(String(fetchCalls[0]?.init?.body ?? "{}")) as { client_attempt_id?: string; owner_user_id?: string };
    assert.equal(payload.client_attempt_id, "attempt_local_1");
    assert.equal(payload.owner_user_id, "user-1");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
});


test("getAttempt with non-UUID id filters on client_attempt_id and returns mapped summary", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    return new Response(JSON.stringify([{
      id: "hosted-id-1",
      owner_user_id: "owner-1",
      client_attempt_id: "attempt_local_123",
      created_at: "2026-04-26T11:00:00.000Z",
      source: "upload",
      drill_id: "drill_pushup",
      drill_version: "v1",
      drill_title: "Push-up",
      movement_type: "REP",
      duration_seconds: 12,
      reps_counted: 8,
      reps_incomplete: 0,
      longest_hold_seconds: null,
      total_hold_seconds: null,
      common_failure_reason: null,
      main_finding: "Great tempo",
      status: "completed",
      analysis_model_version: "analysis-review-v1",
      inserted_at: "2026-04-26T11:00:00.000Z",
      updated_at: "2026-04-26T11:00:00.000Z"
    }]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const repository = new SupabaseAttemptHistoryRepository(makeSession());
    const result = await repository.getAttempt("attempt_local_123");

    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0]?.url ?? "", /attempt_summaries\?select=\*&client_attempt_id=eq\.attempt_local_123&order=created_at\.desc&limit=1/);
    assert.equal(result?.id, "attempt_local_123");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
});

test("getAttempt with UUID id filters on client_attempt_id or hosted id", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const repository = new SupabaseAttemptHistoryRepository(makeSession());
    const result = await repository.getAttempt("550e8400-e29b-41d4-a716-446655440000");

    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0]?.url ?? "", /attempt_summaries\?select=\*&or=\(client_attempt_id\.eq\.550e8400-e29b-41d4-a716-446655440000,id\.eq\.550e8400-e29b-41d4-a716-446655440000\)&order=created_at\.desc&limit=1/);
    assert.equal(result, null);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
});


test("deleteAttempt with non-UUID attempt id only targets client_attempt_id", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const repository = new SupabaseAttemptHistoryRepository(makeSession());
    await repository.deleteAttempt("attempt_local_123");

    assert.equal(fetchCalls.length, 1);
    const url = fetchCalls[0]?.url ?? "";
    assert.match(url, /attempt_summaries\?client_attempt_id=eq\.attempt_local_123/);
    assert.equal(url.includes("id.eq."), false);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
});

test("deleteAttempt with UUID attempt id targets client_attempt_id and id", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    const repository = new SupabaseAttemptHistoryRepository(makeSession());
    await repository.deleteAttempt("550e8400-e29b-41d4-a716-446655440000");

    assert.equal(fetchCalls.length, 1);
    const url = fetchCalls[0]?.url ?? "";
    assert.match(url, /attempt_summaries\?or=\(client_attempt_id\.eq\.550e8400-e29b-41d4-a716-446655440000,id\.eq\.550e8400-e29b-41d4-a716-446655440000\)/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
});
