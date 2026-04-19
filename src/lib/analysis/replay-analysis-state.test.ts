import assert from "node:assert/strict";
import test from "node:test";
import type { AnalysisSessionRecord } from "./session-repository.ts";
import {
  buildReplayAnalysisState,
  getActiveTimelineIndexAtTimestamp,
  getHoldDurationAtTimestamp,
  getHoldMetrics,
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

test("hold duration reflects active hold elapsed at current playhead", () => {
  const session = createSession();
  assert.equal(getHoldDurationAtTimestamp(session, 1300), 100);
  assert.equal(getHoldDurationAtTimestamp(session, 1650), 450);
  assert.equal(getHoldDurationAtTimestamp(session, 1750), 0);
});

test("hold metrics include completed windows plus open hold through clip end", () => {
  const session = createSession();
  session.events.push({ eventId: "h3", timestampMs: 2800, type: "hold_start", phaseId: "up" });
  const early = getHoldMetrics(session, 2600);
  const mid = getHoldMetrics(session, 3200);
  const end = getHoldMetrics(session, 3600);

  assert.equal(early.currentHoldMsAtPlayhead, 0);
  assert.equal(mid.currentHoldMsAtPlayhead, 400);
  assert.equal(end.currentHoldMsAtPlayhead, 800);
  assert.equal(end.detectedHoldMs, 1300);
  assert.equal(end.maxHoldMs, 800);
});

test("phase-only open-ended hold is counted through playhead and clip end", () => {
  const session = createSession();
  session.drillMeasurementType = "hold";
  session.summary.analyzedDurationMs = 18000;
  session.events = [{ eventId: "p-hold", timestampMs: 9598, type: "phase_enter", phaseId: "hold" }];

  const during = getHoldMetrics(session, 14000);
  const before = getHoldMetrics(session, 9000);
  const end = getHoldMetrics(session, 18000);

  assert.equal(before.currentHoldMsAtPlayhead, 0);
  assert.equal(during.currentHoldMsAtPlayhead, 4402);
  assert.equal(end.currentHoldMsAtPlayhead, 8402);
  assert.equal(end.detectedHoldMs, 8402);
});

test("phase enter + exit yields closed hold segment duration", () => {
  const session = createSession();
  session.drillMeasurementType = "hold";
  session.events = [
    { eventId: "p1", timestampMs: 1200, type: "phase_enter", phaseId: "hold" },
    { eventId: "p2", timestampMs: 4200, type: "phase_exit", phaseId: "hold" }
  ];
  session.summary.analyzedDurationMs = 6000;
  const mid = getHoldMetrics(session, 3000);
  const after = getHoldMetrics(session, 5000);
  assert.equal(mid.currentHoldMsAtPlayhead, 1800);
  assert.equal(after.currentHoldMsAtPlayhead, 0);
  assert.equal(after.detectedHoldMs, 3000);
});

test("multiple phase-only hold segments resolve current active segment and max aggregate", () => {
  const session = createSession();
  session.drillMeasurementType = "hold";
  session.summary.analyzedDurationMs = 9000;
  session.events = [
    { eventId: "e1", timestampMs: 1000, type: "phase_enter", phaseId: "hold" },
    { eventId: "e2", timestampMs: 2400, type: "phase_exit", phaseId: "hold" },
    { eventId: "e3", timestampMs: 5000, type: "phase_enter", phaseId: "hold" },
    { eventId: "e4", timestampMs: 7100, type: "phase_exit", phaseId: "hold" }
  ];

  const first = getHoldMetrics(session, 1800);
  const second = getHoldMetrics(session, 6200);
  const done = getHoldMetrics(session, 9000);

  assert.equal(first.currentHoldMsAtPlayhead, 800);
  assert.equal(second.currentHoldMsAtPlayhead, 1200);
  assert.equal(done.currentHoldMsAtPlayhead, 0);
  assert.equal(done.detectedHoldMs, 3500);
  assert.equal(done.maxHoldMs, 2100);
});

test("malformed timestamps clamp negative hold metrics to zero", () => {
  const session = createSession();
  session.summary.analyzedDurationMs = 3000;
  session.summary.holdDurationMs = 0;
  session.events = [
    { eventId: "bad_start", timestampMs: -1500, type: "hold_start", phaseId: "hold" },
    { eventId: "bad_end", timestampMs: -1400, type: "hold_end", phaseId: "hold" }
  ];
  const metrics = getHoldMetrics(session, 2800);
  assert.equal(metrics.currentHoldMsAtPlayhead, 0);
  assert.equal(metrics.detectedHoldMs, 0);
  assert.equal(metrics.maxHoldMs, 0);
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
  assert.equal(late.currentHoldMsAtPlayhead, 0);
  assert.equal(late.detectedHoldMs, 500);
  assert.equal(early.currentPhaseLabel, "2. Down");
  assert.equal(late.currentPhaseLabel, "3. Up");
  assert.equal(late.completedRepsLabel, "Completed reps so far: 2");
  assert.equal(late.activeTimelineIndex, -1);
});

test("active timeline index resolves by timestamp including exact boundaries", () => {
  const segments = [
    { startMs: 0, endMs: 1000 },
    { startMs: 1000, endMs: 2200 },
    { startMs: 2200, endMs: 3600 }
  ];

  assert.equal(getActiveTimelineIndexAtTimestamp(0, segments, 3600), 0);
  assert.equal(getActiveTimelineIndexAtTimestamp(999, segments, 3600), 0);
  assert.equal(getActiveTimelineIndexAtTimestamp(1000, segments, 3600), 1);
  assert.equal(getActiveTimelineIndexAtTimestamp(2200, segments, 3600), 2);
  assert.equal(getActiveTimelineIndexAtTimestamp(3600, segments, 3600), 2);
});

test("buildReplayAnalysisState includes active timeline index when segments are available", () => {
  const session = createSession();
  const phaseLabelsById = { down: "Down", up: "Up", lockout: "Lockout" };
  const replay = buildReplayAnalysisState({
    session,
    phaseLabelsById,
    timestampMs: 2150,
    phaseTimelineSegments: [
      { startMs: 1000, endMs: 2100 },
      { startMs: 2100, endMs: 3200 },
      { startMs: 3200, endMs: 3600 }
    ]
  });
  assert.equal(replay.activeTimelineIndex, 1);
});
