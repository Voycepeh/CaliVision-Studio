import assert from "node:assert/strict";
import test from "node:test";
import type { AnalysisSessionRecord } from "./session-repository.ts";
import { deriveReplayMarkers, deriveReplaySessionOverview, deriveReplayStateAtTime } from "./replay-state.ts";

function createSession(): AnalysisSessionRecord {
  return {
    sessionId: "session-1",
    drillId: "drill-1",
    drillVersion: "v1",
    drillTitle: "Push Up",
    status: "completed",
    sourceKind: "upload",
    sourceId: "upload-1",
    sourceLabel: "attempt.mp4",
    sourceUri: "upload://1",
    rawVideoUri: "upload://1",
    annotatedVideoUri: "upload://1/annotated",
    createdAtIso: "2026-04-07T12:00:00.000Z",
    completedAtIso: "2026-04-07T12:00:10.000Z",
    pipelineVersion: "analysis-pipeline-v1",
    summary: {
      repCount: 2,
      holdDurationMs: 2200,
      analyzedDurationMs: 3000,
      confidenceAvg: 0.92
    },
    frameSamples: [
      { timestampMs: 0, classifiedPhaseId: "start", confidence: 0.9 },
      { timestampMs: 900, classifiedPhaseId: "down", confidence: 0.9 },
      { timestampMs: 1700, classifiedPhaseId: "up", confidence: 0.9 },
      { timestampMs: 2600, classifiedPhaseId: "lockout", confidence: 0.9 }
    ],
    events: [
      { eventId: "a", timestampMs: 800, type: "phase_enter", phaseId: "down" },
      { eventId: "b", timestampMs: 1000, type: "hold_start", phaseId: "down" },
      { eventId: "c", timestampMs: 1600, type: "hold_end", phaseId: "down", details: { holdDurationMs: 600 } },
      { eventId: "d", timestampMs: 1800, type: "rep_complete", repIndex: 1 },
      { eventId: "e", timestampMs: 2400, type: "rep_complete", repIndex: 2 },
      { eventId: "f", timestampMs: 2800, type: "partial_attempt" }
    ]
  };
}

test("deriveReplayStateAtTime resolves phase/rep/hold at timestamps", () => {
  const session = createSession();

  const beforeRep = deriveReplayStateAtTime(session, 1500);
  assert.equal(beforeRep.activePhaseId, "down");
  assert.equal(beforeRep.repCount, 0);
  assert.equal(beforeRep.holdActive, true);
  assert.equal(beforeRep.holdElapsedMs, 500);

  const afterRep = deriveReplayStateAtTime(session, 2500);
  assert.equal(afterRep.activePhaseId, "up");
  assert.equal(afterRep.repCount, 2);
  assert.equal(afterRep.holdActive, false);

  const clamped = deriveReplayStateAtTime(session, 99_999);
  assert.equal(clamped.timestampMs, 3000);
});

test("deriveReplayMarkers returns timeline markers ordered by time", () => {
  const session = createSession();
  const markers = deriveReplayMarkers(session);

  assert.deepEqual(
    markers.map((marker) => marker.type),
    ["phase_enter", "hold_start", "hold_end", "rep_complete", "rep_complete", "partial_attempt"]
  );
  assert.equal(markers[3]?.timestampMs, 1800);
  assert.equal(markers[4]?.repIndex, 2);
});

test("deriveReplaySessionOverview includes phase coverage and quality label", () => {
  const overview = deriveReplaySessionOverview(createSession());
  assert.equal(overview.durationMs, 3000);
  assert.equal(overview.phaseCoverage[0]?.phaseId, "start");
  assert.equal(overview.qualityLabel, "92% confidence");
});

test("missing session returns safe replay defaults", () => {
  const state = deriveReplayStateAtTime(undefined, 1000);
  const markers = deriveReplayMarkers(undefined);
  assert.equal(state.activePhaseId, null);
  assert.equal(state.repCount, 0);
  assert.equal(markers.length, 0);
});
