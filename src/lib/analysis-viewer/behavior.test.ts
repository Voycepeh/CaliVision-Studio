import test from "node:test";
import assert from "node:assert/strict";
import { resolveNextSurface, seekVideoToTimestamp } from "./behavior.ts";

test("resolveNextSurface falls back to available source", () => {
  assert.equal(resolveNextSurface("annotated", { annotated: false, raw: true }), "raw");
  assert.equal(resolveNextSurface("raw", { annotated: true, raw: false }), "annotated");
});

test("seekVideoToTimestamp seeks when duration is valid", () => {
  const mock = { duration: 10, currentTime: 0 } as HTMLVideoElement;
  const ok = seekVideoToTimestamp(mock, 3500);
  assert.equal(ok, true);
  assert.equal(mock.currentTime, 3.5);
});

test("seekVideoToTimestamp returns false for unseekable media", () => {
  const mock = { duration: Number.NaN, currentTime: 0 } as HTMLVideoElement;
  assert.equal(seekVideoToTimestamp(mock, 3500), false);
});
