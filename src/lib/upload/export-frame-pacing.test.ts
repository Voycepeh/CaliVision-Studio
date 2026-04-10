import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEmissionPlanFromSourceTimes,
  buildDeterministicFrameSchedule,
  measureFramePacingStats,
  selectLatestEligibleScheduledFrame
} from "./export-frame-pacing.ts";

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

test("selectLatestEligibleScheduledFrame renders only one frame for a callback tick", () => {
  const selection = selectLatestEligibleScheduledFrame([0, 33, 67, 100], 0, 80);
  assert.equal(selection.renderScheduleIndex, 2);
  assert.equal(selection.nextScheduleIndex, 3);
  assert.equal(selection.skippedScheduledFrames, 2);
});

test("selectLatestEligibleScheduledFrame returns null render when source has not advanced enough", () => {
  const selection = selectLatestEligibleScheduledFrame([100, 133, 167], 0, 90);
  assert.equal(selection.renderScheduleIndex, null);
  assert.equal(selection.nextScheduleIndex, 0);
  assert.equal(selection.skippedScheduledFrames, 0);
});

test("buildEmissionPlanFromSourceTimes keeps emitted timestamps monotonic and capped at duration", () => {
  const schedule = buildDeterministicFrameSchedule(31_400, 30);
  const sourceTimes = Array.from({ length: 950 }, (_, index) => Math.min(31_400, Math.round(index * 33.2)));
  sourceTimes.push(31_400, 31_400, 31_400);

  const plan = buildEmissionPlanFromSourceTimes(schedule, sourceTimes, 31_400);
  assert.equal(plan.renderedTimestampsMs[0], 0);
  assert.equal((plan.renderedTimestampsMs.at(-1) ?? 0) <= 31_400, true);
  assert.equal(Math.abs(31_400 - (plan.renderedTimestampsMs.at(-1) ?? 0)) <= 34, true);
  assert.equal(plan.renderedTimestampsMs.length <= schedule.length, true);

  for (let index = 1; index < plan.renderedTimestampsMs.length; index += 1) {
    assert.equal(plan.renderedTimestampsMs[index] >= plan.renderedTimestampsMs[index - 1], true);
  }
});

test("buildEmissionPlanFromSourceTimes does not emit post-end frames for stale trailing callbacks", () => {
  const schedule = buildDeterministicFrameSchedule(32_000, 30);
  const sourceTimes = [0, 33, 66, 1000, 4000, 16_000, 32_000, 32_000, 32_000, 32_000];

  const plan = buildEmissionPlanFromSourceTimes(schedule, sourceTimes, 32_000);
  const lastTimestampMs = plan.renderedTimestampsMs.at(-1) ?? 0;
  assert.equal(lastTimestampMs <= 32_000, true);
  assert.equal(Math.abs(32_000 - lastTimestampMs) <= 34, true);
  assert.equal(plan.renderedTimestampsMs.filter((timestampMs) => timestampMs === lastTimestampMs).length, 1);
});
