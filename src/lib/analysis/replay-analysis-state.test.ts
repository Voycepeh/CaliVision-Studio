import assert from "node:assert/strict";
import test from "node:test";
import type { AnalysisSessionRecord } from "./session-repository.ts";
import {
  buildReplayAnalysisState,
  getHoldDurationAtTimestamp,
  getPhaseAtTimestamp,
  getRepCountAtTimestamp,
  getRepIndexAtTimestamp
} from "./replay-analysis-state.ts";

function createSession(): AnalysisSessionRecord {
  return {
    sessionId: "session-1",
    drillId: "drill-1",
    drillVersion: "v1",
    drillMeasurementType: "hybrid",
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
      analyzedDurationMs: 3600,
      confidenceAvg: 0.92
    },
    frameSamples: [
      { timestampMs: 0, classifiedPhaseId: "start", confidence: 0.9 },
      { timestampMs: 1100, classifiedPhaseId: "down", confidence: 0.9 },
      { timestampMs: 2200, classifiedPhaseId: "up", confidence: 0.9 },
      { timestampMs: 3200, classifiedPhaseId: "lockout", confidence: 0.9 }
    ],
    events: [
      { eventId: "p1", timestampMs: 1000, type: "phase_enter", phaseId: "down" },
      { eventId: "h1", timestampMs: 1200, type: "hold_start", phaseId: "down" },
      { eventId: "h2", timestampMs: 1700, type: "hold_end", phaseId: "down", details: { holdDurationMs: 500 } },
      { eventId: "r1", timestampMs: 2000, type: "rep_complete", repIndex: 1 },
      { eventId: "p2", timestampMs: 2100, type: "phase_enter", phaseId: "up" },
      { eventId: "r2", timestampMs: 3100, type: "rep_complete", repIndex: 2 }
    ]
  };
}

test("rep count and rep index are playhead-relative while scrubbing", () => {
  const session = createSession();
  assert.equal(getRepCountAtTimestamp(session, 1500), 0);
  assert.equal(getRepCountAtTimestamp(session, 2400), 1);
  assert.equal(getRepCountAtTimestamp(session, 3400), 2);

  assert.equal(getRepIndexAtTimestamp(session, 2400), 1);
  assert.equal(getRepIndexAtTimestamp(session, 3400), 2);
});

test("hold duration reflects elapsed hold at current playhead", () => {
  const session = createSession();
  assert.equal(getHoldDurationAtTimestamp(session, 1300), 100);
  assert.equal(getHoldDurationAtTimestamp(session, 1650), 450);
  assert.equal(getHoldDurationAtTimestamp(session, 1750), 500);
});

test("hold duration includes completed windows plus active hold until session end", () => {
  const session = createSession();
  session.events.push({ eventId: "h3", timestampMs: 2800, type: "hold_start", phaseId: "up" });

  assert.equal(getHoldDurationAtTimestamp(session, 2600), 500);
  assert.equal(getHoldDurationAtTimestamp(session, 3200), 900);
  assert.equal(getHoldDurationAtTimestamp(session, 3600), 1300);
});

test("current phase is resolved at timestamp", () => {
  const session = createSession();
  assert.equal(getPhaseAtTimestamp(session, 900), "start");
  assert.equal(getPhaseAtTimestamp(session, 1500), "down");
  assert.equal(getPhaseAtTimestamp(session, 2300), "up");
});

test("buildReplayAnalysisState returns consistent replay-relative labels", () => {
  const session = createSession();
  const phaseLabelsById = {
    start: "1. Start",
    down: "2. Down",
    up: "3. Up",
    lockout: "4. Lockout"
  };
  const early = buildReplayAnalysisState({ session, phaseLabelsById, timestampMs: 1900 });
  const late = buildReplayAnalysisState({ session, phaseLabelsById, timestampMs: 3200 });
  const rewound = buildReplayAnalysisState({ session, phaseLabelsById, timestampMs: 1400 });

  assert.equal(early.repCount, 0);
  assert.equal(late.repCount, 2);
  assert.equal(rewound.repCount, 0);
  assert.equal(early.currentPhaseLabel, "2. Down");
  assert.equal(late.currentPhaseLabel, "3. Up");
  assert.equal(late.completedRepsLabel, "Completed reps so far: 2");
});
