import test from "node:test";
import assert from "node:assert/strict";
import {
  deserializeAnalysisSession,
  InMemoryAnalysisSessionRepository,
  serializeAnalysisSession,
  type AnalysisSessionRecord
} from "./session-repository.ts";

function buildSession(overrides: Partial<AnalysisSessionRecord> = {}): AnalysisSessionRecord {
  return {
    sessionId: `session-${Math.random().toString(16).slice(2)}`,
    drillId: "drill-alpha",
    drillTitle: "Drill Alpha",
    drillVersion: "v1",
    pipelineVersion: "pipeline-v1",
    sourceKind: "upload",
    sourceId: "upload-1",
    sourceLabel: "attempt.mp4",
    status: "completed",
    createdAtIso: new Date().toISOString(),
    completedAtIso: new Date().toISOString(),
    summary: {
      repCount: 2,
      holdDurationMs: 950,
      analyzedDurationMs: 1800,
      confidenceAvg: 0.82
    },
    frameSamples: [
      { timestampMs: 0, classifiedPhaseId: "top", confidence: 0.9 },
      { timestampMs: 100, classifiedPhaseId: "bottom", confidence: 0.85 }
    ],
    events: [{ eventId: "ev-1", timestampMs: 100, type: "phase_enter", phaseId: "bottom" }],
    ...overrides
  };
}

test("saving and retrieving a completed analysis session preserves events and frame samples", async () => {
  const repository = new InMemoryAnalysisSessionRepository();
  const session = buildSession();

  await repository.saveSession(session);
  const loaded = await repository.getSessionById(session.sessionId);

  assert.ok(loaded);
  assert.equal(loaded?.summary.repCount, 2);
  assert.equal(loaded?.frameSamples.length, 2);
  assert.equal(loaded?.events[0]?.type, "phase_enter");
});

test("list sessions by drill id filters and sorts recent first", async () => {
  const repository = new InMemoryAnalysisSessionRepository();

  await repository.saveSession(buildSession({ sessionId: "a", drillId: "drill-a", createdAtIso: "2026-04-07T10:00:00.000Z" }));
  await repository.saveSession(buildSession({ sessionId: "b", drillId: "drill-b", createdAtIso: "2026-04-07T11:00:00.000Z" }));
  await repository.saveSession(buildSession({ sessionId: "c", drillId: "drill-a", createdAtIso: "2026-04-07T12:00:00.000Z" }));

  const drillASessions = await repository.listSessionsByDrillId("drill-a");
  assert.deepEqual(
    drillASessions.map((session) => session.sessionId),
    ["c", "a"]
  );
});

test("analysis session export/import round-trip is stable", () => {
  const session = buildSession();
  const serialized = serializeAnalysisSession(session);
  const parsed = deserializeAnalysisSession(serialized);

  assert.deepEqual(parsed, session);
});

test("invalid export payload is rejected", () => {
  assert.throws(() => deserializeAnalysisSession(JSON.stringify({ schemaVersion: "bad", session: {} })));
});
