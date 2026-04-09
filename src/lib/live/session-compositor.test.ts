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
