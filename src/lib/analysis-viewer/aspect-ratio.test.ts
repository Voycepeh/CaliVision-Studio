import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAspectRatio, resolveStableAspectRatio } from "./aspect-ratio.ts";

test("resolveStableAspectRatio keeps previous ratio while next metadata is pending", () => {
  const previous = 1.33;
  const next = resolveStableAspectRatio(previous, [undefined, null]);
  assert.equal(next, 1.33);
});

test("resolveStableAspectRatio clamps portrait ratios to avoid thin-strip collapse", () => {
  const next = resolveStableAspectRatio(undefined, [9 / 16]);
  assert.equal(next, 9 / 16);
});

test("resolveStableAspectRatio updates from previous ratio once new source metadata arrives", () => {
  const pending = resolveStableAspectRatio(9 / 16, [undefined, null]);
  assert.equal(pending, 9 / 16);
  const updated = resolveStableAspectRatio(pending, [16 / 9]);
  assert.equal(updated, 16 / 9);
});

test("resolveStableAspectRatio preserves standard landscape media", () => {
  const next = resolveStableAspectRatio(undefined, [16 / 9]);
  assert.equal(next, 16 / 9);
});

test("normalizeAspectRatio rejects invalid values", () => {
  assert.equal(normalizeAspectRatio(0), null);
  assert.equal(normalizeAspectRatio(Number.NaN), null);
  assert.equal(normalizeAspectRatio(undefined), null);
});
