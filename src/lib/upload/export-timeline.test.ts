import assert from "node:assert/strict";
import test from "node:test";
import { resolveExportTimeline } from "./export-timeline.ts";
import type { PoseTimeline } from "./types.ts";

function buildTimeline(overrides?: Partial<PoseTimeline>): PoseTimeline {
  return {
    schemaVersion: "upload-video-v1",
    detector: "mediapipe-pose-landmarker",
    cadenceFps: 12,
    video: {
      fileName: "sample.mp4",
      width: 1280,
      height: 720,
      durationMs: 5000,
      sizeBytes: 1,
      mimeType: "video/mp4"
    },
    frames: [
      { timestampMs: 0, joints: {} },
      { timestampMs: 1000, joints: {} },
      { timestampMs: 2000, joints: {} }
    ],
    generatedAtIso: "2026-04-09T00:00:00.000Z",
    ...overrides
  };
}

test("resolveExportTimeline handles normal duration/fps", () => {
  const resolved = resolveExportTimeline(buildTimeline());
  assert.equal(resolved.durationMs, 5000);
  assert.equal(resolved.fps, 15);
  assert.equal(resolved.totalFrames, 76);
  assert.equal(resolved.durationSource, "timeline-metadata");
});

test("resolveExportTimeline falls back to trace timestamps when metadata is missing", () => {
  const timeline = buildTimeline({
    video: { ...buildTimeline().video, durationMs: Number.NaN },
    frames: [{ timestampMs: 0, joints: {} }, { timestampMs: 4200, joints: {} }]
  });
  const resolved = resolveExportTimeline(timeline);
  assert.equal(resolved.durationMs, 4200);
  assert.equal(resolved.durationSource, "trace-frames");
});

test("resolveExportTimeline rejects invalid duration sources", () => {
  const timeline = buildTimeline({
    video: { ...buildTimeline().video, durationMs: Number.NaN },
    frames: [{ timestampMs: Number.NaN, joints: {} }]
  });
  assert.throws(() => resolveExportTimeline(timeline), /no finite duration/);
});

test("resolveExportTimeline uses default fps when cadence is invalid", () => {
  const resolved = resolveExportTimeline(buildTimeline({ cadenceFps: 0 }));
  assert.equal(resolved.fps, 15);
  assert.equal(resolved.fpsSource, "default");
});

test("resolveExportTimeline guarantees finite totalFrames", () => {
  const resolved = resolveExportTimeline(buildTimeline());
  assert.equal(Number.isFinite(resolved.totalFrames), true);
  assert.equal(resolved.totalFrames > 0, true);
});
