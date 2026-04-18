import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalysisSessionFromLiveTrace, buildTimelineFromLiveTrace } from "./session-compositor.ts";
import type { LiveSessionTrace } from "./types.ts";

const trace: LiveSessionTrace = {
  schemaVersion: "live-session-trace-v1",
  traceId: "live_trace_1",
  startedAtIso: "2026-04-08T00:00:00.000Z",
  completedAtIso: "2026-04-08T00:00:02.000Z",
  sourceType: "browser-camera",
  drillSelection: {
    mode: "freestyle",
    drillBindingLabel: "No drill · Freestyle",
    drillBindingSource: "freestyle"
  },
  cadenceFps: 10,
  video: { durationMs: 2000, width: 720, height: 1280, mimeType: "video/webm", sizeBytes: 1200, timing: { mediaStartMs: 0, mediaStopMs: 2000, captureStartPerfNowMs: 1, captureStopPerfNowMs: 2001 } },
  captures: [
    { timestampMs: 0, frame: { timestampMs: 0, joints: {} }, frameSample: { timestampMs: 0, confidence: 0 } }
  ],
  events: [],
  summary: { analyzedDurationMs: 2000, repCount: 0, holdDurationMs: 0 }
};

test("trace and raw video map into replay/export contracts", () => {
  const timeline = buildTimelineFromLiveTrace(trace);
  const session = buildAnalysisSessionFromLiveTrace(trace);
  assert.equal(timeline.video.durationMs, 2000);
  assert.equal(session.sourceKind, "live");
  assert.equal(session.frameSamples.length, 1);
});

test("live session with a drill can include benchmark comparison payload", () => {
  const drillTrace: LiveSessionTrace = {
    ...trace,
    drillSelection: {
      mode: "drill",
      drillBindingLabel: "Rep Drill",
      drillBindingSource: "local",
      drill: {
        drillId: "drill_benchmark_live",
        title: "Rep Drill",
        drillType: "rep",
        difficulty: "beginner",
        tags: [],
        primaryView: "side",
        phases: [
          { phaseId: "phase_a", order: 1, name: "A", durationMs: 500, poseSequence: [], assetRefs: [] },
          { phaseId: "phase_b", order: 2, name: "B", durationMs: 500, poseSequence: [], assetRefs: [] }
        ],
        benchmark: {
          sourceType: "seeded",
          movementType: "rep",
          phaseSequence: [{ key: "phase_a", order: 1 }, { key: "phase_b", order: 2 }],
          timing: { expectedRepDurationMs: 2000 }
        }
      }
    },
    events: [
      { eventId: "e1", timestampMs: 0, type: "phase_enter", phaseId: "phase_a" },
      { eventId: "e2", timestampMs: 1000, type: "phase_enter", phaseId: "phase_b" },
      { eventId: "e3", timestampMs: 2000, type: "rep_complete", repIndex: 1, details: { repDurationMs: 2000 } }
    ]
  };

  const session = buildAnalysisSessionFromLiveTrace(drillTrace);
  assert.equal(Boolean(session.benchmarkComparison), true);
  assert.equal(session.benchmarkComparison?.benchmarkPresent, true);
});
