import assert from "node:assert/strict";
import test from "node:test";
import { buildDeterministicFrameSchedule, measureFramePacingStats } from "./export-frame-pacing.ts";

test("buildDeterministicFrameSchedule creates a stable cadence ending at duration", () => {
  const schedule = buildDeterministicFrameSchedule(5000, 30);
  assert.equal(schedule[0], 0);
  assert.equal(schedule.at(-1), 5000);
  assert.equal(schedule.length, 151);
});

test("measureFramePacingStats reports duplicate and skipped source frames intentionally", () => {
  const stats = measureFramePacingStats([0, 33, 67, 100, 133], [0, 1, 1, 4, 5]);
  assert.equal(stats.duplicatedFrames, 1);
  assert.equal(stats.skippedSourceFrames, 2);
  assert.equal(Math.round(stats.averageFrameDeltaMs), 33);
});
