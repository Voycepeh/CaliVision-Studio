import assert from "node:assert/strict";
import test from "node:test";

import { assessLiveTraceExportReadiness, formatLiveTraceExportDiagnostics } from "./export-readiness.ts";
import type { LiveSessionTrace } from "./types";

function makeTrace(overrides?: Partial<LiveSessionTrace>): LiveSessionTrace {
  return {
    schemaVersion: "live-session-trace-v1",
    traceId: "trace_export_ready",
    startedAtIso: "2026-04-01T00:00:00.000Z",
    completedAtIso: "2026-04-01T00:00:05.000Z",
    sourceType: "browser-camera",
    drillSelection: {
      mode: "freestyle",
      drillBindingLabel: "Freestyle",
      drillBindingSource: "freestyle"
    },
    cadenceFps: 15,
    video: {
      durationMs: 5000,
      width: 720,
      height: 1280,
      mimeType: "video/webm",
      sizeBytes: 12345,
      timing: { mediaStartMs: 0, mediaStopMs: 5000, captureStartPerfNowMs: 0, captureStopPerfNowMs: 5000 }
    },
    captures: [
      { timestampMs: 0, sourceMediaTimeMs: 0, frame: { timestampMs: 0, joints: {} }, frameSample: { timestampMs: 0, confidence: 0.5 } },
      { timestampMs: 250, sourceMediaTimeMs: 230, frame: { timestampMs: 250, joints: {} }, frameSample: { timestampMs: 250, confidence: 0.6 } },
      { timestampMs: 500, sourceMediaTimeMs: 480, frame: { timestampMs: 500, joints: {} }, frameSample: { timestampMs: 500, confidence: 0.6 } }
    ],
    events: [],
    summary: { repCount: 0, holdDurationMs: 0, analyzedDurationMs: 5000, confidenceAvg: 0.55, lowConfidenceFrames: 0 },
    ...overrides
  };
}

test("valid advancing live trace is accepted for annotated export", () => {
  const readiness = assessLiveTraceExportReadiness(makeTrace());
  assert.equal(readiness.canAttemptAnnotatedExport, true);
  assert.equal(readiness.failureReasons.length, 0);
  assert.ok(readiness.diagnostics.renderableFrameCount >= 2);
});

test("trace with non-advancing finalized samples is rejected with explicit diagnostics", () => {
  const readiness = assessLiveTraceExportReadiness({
    captures: [
      { timestampMs: 0, sourceMediaTimeMs: 0, frame: { timestampMs: 0, joints: {} }, frameSample: { timestampMs: 0, confidence: 0.4 } }
    ],
    video: { durationMs: 5000 }
  } as unknown as LiveSessionTrace);

  assert.ok(readiness.failureReasons.length > 0);
  assert.ok(readiness.failureReasons.some((reason) => reason.includes("sampleCount=1") || reason.includes("uniqueTraceTimestamps=1")));

  const detail = formatLiveTraceExportDiagnostics({ diagnostics: readiness.diagnostics, failureReasons: readiness.failureReasons });
  assert.ok(detail.includes("renderableFrames=1"));
  assert.ok(detail.includes("rejected="));
});

test("sparse source timestamps keep export enabled with degraded warning", () => {
  const trace = makeTrace({
    captures: [
      { timestampMs: 0, sourceMediaTimeMs: 0, frame: { timestampMs: 0, joints: {} }, frameSample: { timestampMs: 0, confidence: 0.5 } },
      { timestampMs: 333, sourceMediaTimeMs: 0, frame: { timestampMs: 333, joints: {} }, frameSample: { timestampMs: 333, confidence: 0.55 } },
      { timestampMs: 666, sourceMediaTimeMs: 50, frame: { timestampMs: 666, joints: {} }, frameSample: { timestampMs: 666, confidence: 0.58 } }
    ]
  });

  const readiness = assessLiveTraceExportReadiness(trace);
  assert.equal(readiness.canAttemptAnnotatedExport, true);
  assert.equal(readiness.degradeToSparseExport, true);
  assert.ok(readiness.warnings.length > 0);
});
