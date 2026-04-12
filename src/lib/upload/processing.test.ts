import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMonotonicSampleTimestamps,
  computeMinimumViableSamples,
  shouldFailSampling
} from "./processing-sampling.ts";

test("monotonic sample schedule always increases and stays within duration", () => {
  const timestamps = buildMonotonicSampleTimestamps(1_000, 333.33, 1);
  assert.ok(timestamps.length > 0);
  assert.equal(timestamps[0], 0);
  for (let i = 1; i < timestamps.length; i += 1) {
    assert.ok(timestamps[i] > timestamps[i - 1]);
  }
  assert.ok(timestamps.at(-1)! <= 1_000);
});

test("mobile-like reduced-density stride generates fewer planned timestamps", () => {
  const dense = buildMonotonicSampleTimestamps(3_000, 100, 1);
  const reduced = buildMonotonicSampleTimestamps(3_000, 100, 2);
  assert.ok(reduced.length < dense.length);
  assert.equal(reduced[0], 0);
});

test("minimum viable samples enforces absolute floor and ratio", () => {
  assert.equal(computeMinimumViableSamples(4), 6);
  assert.equal(computeMinimumViableSamples(40), 14);
});

test("single timestamp failure does not force full sampling failure when enough samples remain", () => {
  const outcome = shouldFailSampling({ successfulSamples: 20, plannedSampleCount: 21 });
  assert.equal(outcome.fail, false);
  assert.ok(outcome.minimumViableSampleCount <= 20);
});

test("sampling fails only when collected samples are below minimum viable count", () => {
  const outcome = shouldFailSampling({ successfulSamples: 5, plannedSampleCount: 18 });
  assert.equal(outcome.fail, true);
  assert.equal(outcome.minimumViableSampleCount, 7);
});
