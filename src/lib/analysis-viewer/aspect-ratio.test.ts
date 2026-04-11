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
  assert.equal(next, 0.7);
});

test("normalizeAspectRatio rejects invalid values", () => {
  assert.equal(normalizeAspectRatio(0), null);
  assert.equal(normalizeAspectRatio(Number.NaN), null);
  assert.equal(normalizeAspectRatio(undefined), null);
});
