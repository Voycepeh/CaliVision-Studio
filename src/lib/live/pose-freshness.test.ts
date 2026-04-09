import assert from "node:assert/strict";
import test from "node:test";
import { summarizeLiveTraceFreshness } from "./pose-freshness.ts";
import type { LiveSessionTrace } from "./types.ts";

function createTrace(captures: LiveSessionTrace["captures"]): Pick<LiveSessionTrace, "captures" | "video"> {
  return {
    captures,
    video: {
      durationMs: 3_000,
      width: 720,
      height: 1280,
      mimeType: "video/webm",
      sizeBytes: 1000,
      timing: {
        mediaStartMs: 0,
        mediaStopMs: 3_000,
        captureStartPerfNowMs: 0,
        captureStopPerfNowMs: 3_000
      }
    }
  };
}

test("summarizeLiveTraceFreshness flags repeated stale frame samples", () => {
  const frame = {
    joints: {
      nose: { x: 0.5, y: 0.4 },
      leftWrist: { x: 0.2, y: 0.8 }
    }
  };
  const summary = summarizeLiveTraceFreshness(
    createTrace([
      { timestampMs: 0, frame: { timestampMs: 0, ...frame }, frameSample: { timestampMs: 0, confidence: 0 } },
      { timestampMs: 0, frame: { timestampMs: 0, ...frame }, frameSample: { timestampMs: 0, confidence: 0 } },
      { timestampMs: 0, frame: { timestampMs: 0, ...frame }, frameSample: { timestampMs: 0, confidence: 0 } }
    ])
  );

  assert.equal(summary.hasSufficientFreshness, false);
  assert.equal(summary.uniqueTimestampCount, 1);
  assert.equal(summary.uniqueFingerprintCount, 1);
});

test("summarizeLiveTraceFreshness accepts evolving samples", () => {
  const summary = summarizeLiveTraceFreshness(createTrace([
    {
      timestampMs: 0,
      frame: { timestampMs: 0, joints: { nose: { x: 0.1, y: 0.2 } } },
      frameSample: { timestampMs: 0, confidence: 0.4, classifiedPhaseId: "phase_a" }
    },
    {
      timestampMs: 200,
      frame: { timestampMs: 200, joints: { nose: { x: 0.3, y: 0.4 } } },
      frameSample: { timestampMs: 200, confidence: 0.4, classifiedPhaseId: "phase_a" }
    },
    {
      timestampMs: 400,
      frame: { timestampMs: 400, joints: { nose: { x: 0.6, y: 0.5 } } },
      frameSample: { timestampMs: 400, confidence: 0.4, classifiedPhaseId: "phase_b" }
    }
  ]));

  assert.equal(summary.hasSufficientFreshness, true);
  assert.equal(summary.uniqueTimestampCount, 3);
  assert.equal(summary.uniqueFingerprintCount, 3);
});
