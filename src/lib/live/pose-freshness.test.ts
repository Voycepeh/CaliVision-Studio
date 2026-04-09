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

test("freshness fails when source frame time is frozen even if synthetic timestamps advance", () => {
  const captures = Array.from({ length: 20 }, (_, index) => ({
    timestampMs: index * 50,
    sourceMediaTimeMs: 0,
    frame: {
      timestampMs: index * 50,
      joints: {
        nose: { x: 0.3 + index * 0.0002, y: 0.5 + index * 0.0002 }
      }
    },
    frameSample: { timestampMs: index * 50, confidence: 0.4 }
  })) satisfies LiveSessionTrace["captures"];

  const summary = summarizeLiveTraceFreshness(createTrace(captures));
  assert.equal(summary.hasSufficientFreshness, false);
  assert.ok(summary.failureReasons.some((reason) => reason.startsWith("uniqueSourceTimestamps=")));
  assert.ok(summary.failureReasons.some((reason) => reason.startsWith("sourceTimeAdvancementMs=")));
});

test("freshness passes for continuously advancing source frames", () => {
  const captures = Array.from({ length: 24 }, (_, index) => ({
    timestampMs: index * 50,
    sourceMediaTimeMs: index * 45,
    frame: {
      timestampMs: index * 50,
      joints: {
        nose: { x: 0.2 + index * 0.01, y: 0.3 + index * 0.008 }
      }
    },
    frameSample: { timestampMs: index * 50, confidence: 0.5 }
  })) satisfies LiveSessionTrace["captures"];

  const summary = summarizeLiveTraceFreshness(createTrace(captures));
  assert.equal(summary.hasSufficientFreshness, true);
  assert.equal(summary.failureReasons.length, 0);
});
