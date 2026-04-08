import assert from "node:assert/strict";
import test from "node:test";
import { formatDurationShort } from "./duration.ts";

test("formats sub-10-second durations with tenths when useful", () => {
  assert.equal(formatDurationShort(1200), "1.2s");
  assert.equal(formatDurationShort(1000), "1s");
  assert.equal(formatDurationShort(9950), "10s");
});

test("formats 10s+ durations as whole seconds", () => {
  assert.equal(formatDurationShort(12000), "12s");
  assert.equal(formatDurationShort(18400), "18s");
});

test("guards invalid and negative input", () => {
  assert.equal(formatDurationShort(Number.NaN), "0s");
  assert.equal(formatDurationShort(-500), "0s");
});
