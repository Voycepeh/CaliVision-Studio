import test from "node:test";
import assert from "node:assert/strict";
import { resolveCompareVisualAvailability } from "./visual-sources.ts";

test("compare supports pose replay when no attempt video url is provided", () => {
  const availability = resolveCompareVisualAvailability({
    attemptPoseFrames: [{ timestampMs: 0, joints: {} }]
  });

  assert.equal(availability.attemptHasVideo, false);
  assert.equal(availability.attemptHasPoseReplay, true);
});
