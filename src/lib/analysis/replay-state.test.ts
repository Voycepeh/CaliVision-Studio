import assert from "node:assert/strict";
import test from "node:test";
import type { AnalysisSessionRecord } from "./session-repository.ts";
import { buildReplayOverlaySamples, deriveReplayMarkers, deriveReplayOverlayStateAtTime, deriveReplaySessionOverview, deriveReplayStateAtTime, getOverlaySampleAtTime } from "./replay-state.ts";

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

test("deriveReplayStateAtTime tolerates unsorted frame samples and events", () => {
  const session = createSession();
  session.frameSamples = [
    { timestampMs: 2600, classifiedPhaseId: "lockout", confidence: 0.9 },
    { timestampMs: 0, classifiedPhaseId: "start", confidence: 0.9 },
    { timestampMs: 1700, classifiedPhaseId: "up", confidence: 0.9 },
    { timestampMs: 900, classifiedPhaseId: "down", confidence: 0.9 }
  ];
  session.events = [
    { eventId: "f", timestampMs: 2800, type: "partial_attempt" },
    { eventId: "d", timestampMs: 1800, type: "rep_complete", repIndex: 1 },
    { eventId: "b", timestampMs: 1000, type: "hold_start", phaseId: "down" },
    { eventId: "e", timestampMs: 2400, type: "rep_complete", repIndex: 2 },
    { eventId: "c", timestampMs: 1600, type: "hold_end", phaseId: "down", details: { holdDurationMs: 600 } },
    { eventId: "a", timestampMs: 800, type: "phase_enter", phaseId: "down" }
  ];

  const state = deriveReplayStateAtTime(session, 2500);
  assert.equal(state.activePhaseId, "up");
  assert.equal(state.repCount, 2);
  assert.equal(state.holdActive, false);
  assert.equal(state.nearestEvent?.eventId, "e");
});

test("deriveReplayMarkers orders markers when events are unsorted", () => {
  const session = createSession();
  session.events = [...session.events].reverse();
  const markers = deriveReplayMarkers(session);

  assert.deepEqual(
    markers.map((marker) => marker.timestampMs),
    [800, 1000, 1600, 1800, 2400, 2800]
  );
});

test("deriveReplaySessionOverview includes phase coverage and quality label", () => {
  const overview = deriveReplaySessionOverview(createSession());
  assert.equal(overview.durationMs, 3000);
  assert.equal(overview.phaseCoverage[0]?.phaseId, "start");
  assert.equal(overview.qualityLabel, "92% confidence");
});

test("missing session returns safe replay defaults", () => {
  const state = deriveReplayStateAtTime(undefined, 1000);
  const overlay = deriveReplayOverlayStateAtTime(undefined, 1000);
  const markers = deriveReplayMarkers(undefined);
  assert.equal(state.activePhaseId, null);
  assert.equal(overlay.phaseLabel, null);
  assert.equal(overlay.showRepCount, false);
  assert.equal(overlay.showHoldTimer, false);
  assert.equal(state.repCount, 0);
  assert.equal(markers.length, 0);
});

test("overlay state shows rep count and active hold timer signals", () => {
  const session = createSession();

  const inHold = deriveReplayOverlayStateAtTime(session, 1500);
  assert.equal(inHold.phaseLabel, "down");
  assert.equal(inHold.showRepCount, true);
  assert.equal(inHold.showHoldTimer, true);
  assert.equal(inHold.statusLabel, "Rep in progress");

  const afterHold = deriveReplayOverlayStateAtTime(session, 2500);
  assert.equal(afterHold.showRepCount, true);
  assert.equal(afterHold.showHoldTimer, true);
  assert.equal(afterHold.statusLabel, "Rep counted");
});

test("overlay state falls back to phase-enter events when frame samples are missing", () => {
  const session = createSession();
  session.frameSamples = [];
  const overlay = deriveReplayOverlayStateAtTime(session, 1100);
  assert.equal(overlay.phaseLabel, "down");
});

test("overlay state surfaces low-confidence status for no reliable runs", () => {
  const session = createSession();
  session.debug = { noEventCause: "low_confidence_frames" };
  session.frameSamples = [{ timestampMs: 0, classifiedPhaseId: undefined, confidence: 0.05 }];
  const overlay = deriveReplayOverlayStateAtTime(session, 0);
  assert.equal(overlay.phaseLabel, null);
  assert.equal(overlay.statusLabel, "Low confidence");
});

test("overlay helper stays aligned with base replay derivation", () => {
  const session = createSession();
  const base = deriveReplayStateAtTime(session, 2500);
  const overlay = deriveReplayOverlayStateAtTime(session, 2500);
  assert.equal(overlay.timestampMs, base.timestampMs);
  assert.equal(overlay.repCount, base.repCount);
  assert.equal(overlay.holdActive, base.holdActive);
});

test("overlay state keeps rep count visible even when no rep events exist", () => {
  const session = createSession();
  session.drillMeasurementType = "rep";
  session.summary.repCount = undefined;
  session.events = session.events.filter((event) => event.type !== "rep_complete");
  const overlay = deriveReplayOverlayStateAtTime(session, 1200);
  assert.equal(overlay.repCount, 0);
  assert.equal(overlay.showRepCount, true);
});

test("replay state ignores invalid timestamps and durations", () => {
  const session = createSession();
  session.summary.analyzedDurationMs = Number.POSITIVE_INFINITY;
  session.frameSamples.push({ timestampMs: Number.NaN, classifiedPhaseId: "bad", confidence: 0.1 });
  session.events.push({ eventId: "bad", timestampMs: Number.NaN, type: "phase_enter", phaseId: "bad" });

  const state = deriveReplayStateAtTime(session, Number.NaN);
  assert.equal(state.timestampMs, 0);
  assert.equal(state.repCount, 0);
});

test("overlay samples are time-indexed and queryable for replay/export rendering", () => {
  const session = createSession();
  const samples = buildReplayOverlaySamples(session, [0, 900, 1800, 2600]);
  assert.equal(samples.length, 4);
  assert.equal(samples[2]?.state.repCount, 1);

  const at2s = getOverlaySampleAtTime(samples, 2000);
  assert.equal(at2s?.repCount, 1);
  assert.equal(at2s?.showRepCount, true);
});

test("overlay rep status surfaces skipped phase outcomes using authored labels", () => {
  const session = createSession();
  session.events.push({
    eventId: "skip_1",
    timestampMs: 2950,
    type: "partial_attempt",
    details: {
      reason: "skipped_required_phase",
      expectedPhaseLabel: "2. Hands Up"
    }
  });
  const overlay = deriveReplayOverlayStateAtTime(session, 2999);
  assert.equal(overlay.statusLabel, "Skipped phase: 2. Hands Up");
  assert.equal(overlay.repOutcome?.kind, "skipped_phase");
});

test("hold measurement overlay hides rep status and rep counters", () => {
  const session = createSession();
  session.drillMeasurementType = "hold";
  session.events = session.events.filter((event) => event.type !== "rep_complete" && event.type !== "partial_attempt");
  const overlay = deriveReplayOverlayStateAtTime(session, 1200);

  assert.equal(overlay.showRepCount, false);
  assert.equal(overlay.showHoldTimer, true);
  assert.equal(overlay.statusLabel, undefined);
  assert.equal(overlay.repOutcome, undefined);
});
