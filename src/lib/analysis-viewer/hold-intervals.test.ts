import test from "node:test";
import assert from "node:assert/strict";
import { buildHoldIntervals, formatHoldExitReason } from "./hold-intervals.ts";
import type { AnalysisViewerEvent, AnalysisViewerPhaseTimelineSegment } from "./types.ts";

test("multiple hold intervals each get a generated checkpoint at their own start timestamp", () => {
  const events: AnalysisViewerEvent[] = [
    { id: "h1s", kind: "hold", timestampMs: 10_000, label: "hold_start", eventType: "hold_start", phaseId: "phase_up" },
    { id: "h1e", kind: "hold", timestampMs: 12_000, label: "hold_end", eventType: "hold_end", phaseId: "phase_up", exitReason: "phase_exit" },
    { id: "h2s", kind: "hold", timestampMs: 14_000, label: "hold_start", eventType: "hold_start", phaseId: "phase_up" },
    { id: "h2e", kind: "hold", timestampMs: 16_000, label: "hold_end", eventType: "hold_end", phaseId: "phase_up", exitReason: "match_rejected" }
  ];
  const segments: AnalysisViewerPhaseTimelineSegment[] = [
    { id: "seg_up", label: "1. Up", startMs: 10_000, endMs: 16_000, seekTimestampMs: 10_000, interactive: true, phaseId: "phase_up" }
  ];

  const intervals = buildHoldIntervals(events, segments);
  assert.equal(intervals.length, 2);
  assert.equal(intervals[0]?.checkpoints.length > 0, true);
  assert.equal(intervals[1]?.checkpoints.length > 0, true);
  assert.equal(intervals[0]?.checkpoints[0]?.timestampMs, 10_000);
  assert.equal(intervals[1]?.checkpoints[0]?.timestampMs, 14_000);
  assert.equal(intervals[0]?.checkpoints[0]?.label, "1. Up");
  assert.equal(intervals[1]?.checkpoints[0]?.label, "1. Up");
});

test("internal phase ids are not surfaced as hold interval phase labels", () => {
  const intervals = buildHoldIntervals(
    [
      { id: "h1s", kind: "hold", timestampMs: 1000, label: "hold_start", eventType: "hold_start", phaseId: "phase_mo4f8xs3_c0aw8u" },
      { id: "h1e", kind: "hold", timestampMs: 1500, label: "hold_end", eventType: "hold_end", phaseId: "phase_mo4f8xs3_c0aw8u", exitReason: "session_end" }
    ],
    []
  );

  assert.equal(intervals[0]?.phaseLabel, undefined);
  assert.equal(intervals[0]?.checkpoints[0]?.label, "Hold phase");
});

test("hold exit reasons are formatted with user-facing labels", () => {
  assert.equal(formatHoldExitReason("match_rejected"), "Pose no longer matched");
  assert.equal(formatHoldExitReason("low_confidence"), "Pose tracking lost");
  assert.equal(formatHoldExitReason("phase_replaced"), "Moved to another phase");
  assert.equal(formatHoldExitReason("phase_exit"), "Left hold phase");
  assert.equal(formatHoldExitReason("session_end"), "Session ended");
});
