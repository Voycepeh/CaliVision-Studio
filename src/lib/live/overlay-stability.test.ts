import test from "node:test";
import assert from "node:assert/strict";
import { createLiveOverlayStabilizer } from "./overlay-stability.ts";
import type { PoseFrame } from "../upload/types.ts";

function frame(timestampMs: number, confidence: number, x = 0.5): PoseFrame {
  return {
    timestampMs,
    joints: {
      leftWrist: {
        x,
        y: 0.4,
        confidence
      }
    }
  };
}

test("stabilizer smooths landmark movement for live overlay", () => {
  const stabilizer = createLiveOverlayStabilizer({ smoothingAlpha: 0.5 });
  const first = stabilizer.stabilize(frame(0, 0.9, 0.2));
  const second = stabilizer.stabilize(frame(100, 0.9, 0.8));

  assert.equal(first.joints.leftWrist?.x, 0.2);
  assert.equal(second.joints.leftWrist?.x, 0.5);
});

test("stabilizer applies confidence hysteresis to avoid visibility popping", () => {
  const stabilizer = createLiveOverlayStabilizer({
    visibilityEnterThreshold: 0.6,
    visibilityExitThreshold: 0.45
  });

  const belowEnter = stabilizer.stabilize(frame(0, 0.55));
  assert.equal(belowEnter.joints.leftWrist, undefined);

  const aboveEnter = stabilizer.stabilize(frame(100, 0.7));
  assert.ok(aboveEnter.joints.leftWrist);

  const aboveExit = stabilizer.stabilize(frame(200, 0.5));
  assert.ok(aboveExit.joints.leftWrist);

  const belowExit = stabilizer.stabilize(frame(300, 0.4));
  assert.equal(belowExit.joints.leftWrist, undefined);
});
