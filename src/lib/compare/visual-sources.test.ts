import test from "node:test";
import assert from "node:assert/strict";
import { resolveCompareVisualAvailability, resolveUsableCompareVisualState } from "./visual-sources.ts";

test("compare supports pose replay when no attempt video url is provided", () => {
  const availability = resolveCompareVisualAvailability({
    attemptPoseFrames: [{ timestampMs: 0, joints: {} }]
  });

  assert.equal(availability.attemptHasVideo, false);
  assert.equal(availability.attemptHasPoseReplay, true);
});

test("usable state reports no attempt visual when video fails and no pose replay exists", () => {
  const availability = resolveCompareVisualAvailability({
    attemptVideoUrl: "blob:example",
    attemptPoseFrames: []
  });
  const usable = resolveUsableCompareVisualState({
    availability,
    attemptVideoFailed: true
  });

  assert.equal(usable.hasUsableAttemptVisual, false);
});
