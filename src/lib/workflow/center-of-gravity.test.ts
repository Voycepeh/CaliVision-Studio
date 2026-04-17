import test from "node:test";
import assert from "node:assert/strict";
import { createCenterOfGravityTracker, estimateCenterOfGravity } from "./center-of-gravity.ts";

type TestPoseFrame = {
  timestampMs: number;
  joints: Record<string, { x: number; y: number; confidence?: number } | undefined>;
};

function buildStandingPoseFrame(timestampMs: number, overrides?: Partial<TestPoseFrame["joints"]>): TestPoseFrame {
  return {
    timestampMs,
    joints: {
      leftShoulder: { x: 0.42, y: 0.26, confidence: 0.93 },
      rightShoulder: { x: 0.58, y: 0.26, confidence: 0.94 },
      leftElbow: { x: 0.38, y: 0.4, confidence: 0.9 },
      rightElbow: { x: 0.62, y: 0.4, confidence: 0.9 },
      leftWrist: { x: 0.35, y: 0.53, confidence: 0.88 },
      rightWrist: { x: 0.65, y: 0.53, confidence: 0.88 },
      leftHip: { x: 0.45, y: 0.52, confidence: 0.95 },
      rightHip: { x: 0.55, y: 0.52, confidence: 0.95 },
      leftKnee: { x: 0.46, y: 0.72, confidence: 0.93 },
      rightKnee: { x: 0.54, y: 0.72, confidence: 0.93 },
      leftAnkle: { x: 0.47, y: 0.92, confidence: 0.91 },
      rightAnkle: { x: 0.53, y: 0.92, confidence: 0.91 },
      ...overrides
    }
  };
}

test("valid standing pose returns a non-null center of gravity", () => {
  const estimate = estimateCenterOfGravity(buildStandingPoseFrame(100));
  assert.ok(estimate);
  assert.ok(estimate.coverageRatio > 0.7);
  assert.ok(estimate.x > 0.46 && estimate.x < 0.54);
  assert.ok(estimate.y > 0.45 && estimate.y < 0.72);
});

test("partial but usable landmark coverage still yields CoG", () => {
  const estimate = estimateCenterOfGravity(
    buildStandingPoseFrame(120, {
      leftWrist: undefined,
      rightWrist: undefined,
      leftElbow: undefined,
      rightElbow: undefined,
      leftAnkle: undefined,
      rightAnkle: undefined
    })
  );
  assert.ok(estimate);
  assert.ok(estimate.coverageRatio >= 0.28);
});

test("poor landmark coverage is suppressed by the tracker", () => {
  const tracker = createCenterOfGravityTracker();
  const decision = tracker.resolve(
    buildStandingPoseFrame(140, {
      leftShoulder: undefined,
      rightShoulder: undefined,
      leftHip: undefined,
      rightHip: undefined,
      leftKnee: undefined,
      rightKnee: undefined
    })
  );
  assert.equal(decision.visible, false);
  assert.equal(decision.reason, "insufficient_core_segments");
});

test("tracker smoothing and reset behavior handles replay seek/session restart", () => {
  const tracker = createCenterOfGravityTracker({ smoothingAlpha: 0.5, requiredValidFrames: 1 });
  const frameA = buildStandingPoseFrame(100);
  const frameB = buildStandingPoseFrame(133, {
    leftHip: { x: 0.5, y: 0.55, confidence: 0.95 },
    rightHip: { x: 0.62, y: 0.55, confidence: 0.95 }
  });

  const first = tracker.resolve(frameA);
  const second = tracker.resolve(frameB);
  assert.ok(first.visible && first.point);
  assert.ok(second.visible && second.point);
  assert.ok(second.point.x > first.point.x);

  const seekReset = tracker.resolve(buildStandingPoseFrame(20));
  assert.equal(seekReset.visible, false);
  assert.equal(seekReset.reason, "seek_reset");

  tracker.reset();
  const afterReset = tracker.resolve(frameA);
  assert.equal(afterReset.visible, true);
  assert.ok(afterReset.point);
});
