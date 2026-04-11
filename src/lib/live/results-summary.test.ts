import test from "node:test";
import assert from "node:assert/strict";
import { buildLiveResultsSummary, getReplayStateMessage, mapLiveTraceToTimelineMarkers } from "./results-summary.ts";
import type { LiveSessionTrace } from "./types.ts";

const trace: LiveSessionTrace = {
  schemaVersion: "live-session-trace-v1",
  traceId: "live_trace_summary",
  startedAtIso: "2026-04-09T10:00:00.000Z",
  completedAtIso: "2026-04-09T10:01:00.000Z",
  sourceType: "browser-camera",
  drillSelection: {
    mode: "drill",
    drillBindingLabel: "Air Squat",
    drillBindingSource: "local",
    drill: {
      drillId: "squat_1",
      slug: "air-squat",
      title: "Air Squat",
      drillType: "rep",
      difficulty: "beginner",
      tags: [],
      primaryView: "side",
      phases: []
    }
  },
  cadenceFps: 10,
  video: {
    durationMs: 60000,
    width: 720,
    height: 1280,
    mimeType: "video/webm",
    sizeBytes: 1234,
    timing: {
      mediaStartMs: 0,
      mediaStopMs: 60000,
      captureStartPerfNowMs: 0,
      captureStopPerfNowMs: 60000
    }
  },
  captures: [],
  events: [
    { eventId: "evt_1", timestampMs: 3000, type: "phase_enter", phaseId: "setup" },
    { eventId: "evt_2", timestampMs: 6000, type: "hold_start", phaseId: "setup" },
    { eventId: "evt_3", timestampMs: 9000, type: "hold_end", phaseId: "setup", details: { durationMs: 3000 } },
    { eventId: "evt_4", timestampMs: 12000, type: "phase_enter", phaseId: "descent" },
    { eventId: "evt_5", timestampMs: 15000, type: "rep_complete", repIndex: 1 }
  ],
  summary: {
    repCount: 1,
    holdDurationMs: 3000,
    analyzedDurationMs: 60000,
    confidenceAvg: 0.7
  }
};

test("buildLiveResultsSummary returns rep/hold/phase labels", () => {
  const summary = buildLiveResultsSummary(trace);
  assert.equal(summary.drillLabel, "Air Squat");
  assert.equal(summary.durationLabel, "1m 00s");
  assert.equal(summary.repCount, 1);
  assert.equal(summary.holdSummaryLabel, "1 hold · 3s total");
  assert.equal(summary.phaseSummaryLabel, "2 transitions · 2 phases");
});

test("mapLiveTraceToTimelineMarkers includes rep/hold/phase events in order", () => {
  const markers = mapLiveTraceToTimelineMarkers(trace, { setup: "1. Setup", descent: "2. Hands Up" });
  assert.deepEqual(
    markers.map((marker) => ({ id: marker.id, kind: marker.kind })),
    [
      { id: "evt_1", kind: "phase" },
      { id: "evt_2", kind: "hold" },
      { id: "evt_3", kind: "hold" },
      { id: "evt_4", kind: "phase" },
      { id: "evt_5", kind: "rep" }
    ]
  );
  assert.match(markers[0].label, /3s/);
  assert.match(markers[0].label, /1\. Setup/);
  assert.match(markers[3].label, /2\. Hands Up/);
});

test("getReplayStateMessage returns truthful fallback message", () => {
  assert.equal(getReplayStateMessage("export-in-progress"), "Exporting annotated replay…");
  assert.equal(getReplayStateMessage("annotated-ready"), "Annotated replay ready");
  assert.equal(getReplayStateMessage("raw-fallback"), "Annotated replay failed. Showing raw recording fallback");
});

test("buildLiveResultsSummary guards invalid duration math", () => {
  const summary = buildLiveResultsSummary({
    ...trace,
    video: { ...trace.video, durationMs: Number.POSITIVE_INFINITY },
    events: [{ eventId: "evt_bad", timestampMs: 1000, type: "hold_end", phaseId: "setup", details: { durationMs: Number.NaN } }],
    summary: { ...trace.summary, holdDurationMs: Number.NaN }
  });

  assert.equal(summary.durationLabel, "Duration unavailable");
  assert.equal(summary.holdSummaryLabel, "1 hold · Duration unavailable");
});
