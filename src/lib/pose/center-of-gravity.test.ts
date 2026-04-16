import test from "node:test";
import assert from "node:assert/strict";
import type { PoseFrame } from "@/lib/upload/types";

import {
  createCenterOfGravityOverlayState,
  estimateCenterOfGravity2D,
  resetCenterOfGravityOverlayState,
  resolveSmoothedCenterOfGravity,
  shouldRenderCenterOfGravity,
  TemporalPointSmoother
} from "./center-of-gravity.ts";

function createPoseFrame(): Pick<PoseFrame, "joints"> {
  return {
    joints: {
      nose: { x: 0.5, y: 0.2, confidence: 0.95 },
      leftShoulder: { x: 0.42, y: 0.33, confidence: 0.95 },
      rightShoulder: { x: 0.58, y: 0.33, confidence: 0.95 },
      leftElbow: { x: 0.37, y: 0.46, confidence: 0.95 },
      rightElbow: { x: 0.63, y: 0.46, confidence: 0.95 },
      leftWrist: { x: 0.35, y: 0.59, confidence: 0.95 },
      rightWrist: { x: 0.65, y: 0.59, confidence: 0.95 },
      leftHip: { x: 0.45, y: 0.58, confidence: 0.95 },
      rightHip: { x: 0.55, y: 0.58, confidence: 0.95 },
      leftKnee: { x: 0.45, y: 0.74, confidence: 0.95 },
      rightKnee: { x: 0.55, y: 0.74, confidence: 0.95 },
      leftAnkle: { x: 0.45, y: 0.9, confidence: 0.95 },
      rightAnkle: { x: 0.55, y: 0.9, confidence: 0.95 }
    }
  };
}

test("estimateCenterOfGravity2D returns a stable weighted center for valid pose coverage", () => {
  const frame = createPoseFrame();
  const center = estimateCenterOfGravity2D(frame);
  assert.ok(center);
  assert.ok(center.x > 0.48 && center.x < 0.52);
  assert.ok(center.y > 0.5 && center.y < 0.62);
});

test("estimateCenterOfGravity2D degrades gracefully when confidence/coverage is low", () => {
  const frame = createPoseFrame();
  frame.joints.leftHip!.confidence = 0.1;
  frame.joints.rightHip!.confidence = 0.1;
  frame.joints.leftKnee!.confidence = 0.1;
  frame.joints.rightKnee!.confidence = 0.1;
  frame.joints.leftAnkle!.confidence = 0.1;
  frame.joints.rightAnkle!.confidence = 0.1;
  const center = estimateCenterOfGravity2D(frame);
  assert.equal(center, null);
});

test("estimateCenterOfGravity2D still returns a point when one side coverage is missing but torso/limbs are usable", () => {
  const frame = createPoseFrame();
  frame.joints.rightElbow!.confidence = 0.1;
  frame.joints.rightWrist!.confidence = 0.1;
  frame.joints.rightKnee!.confidence = 0.1;
  const center = estimateCenterOfGravity2D(frame);
  assert.ok(center);
});

test("TemporalPointSmoother reset clears historical smoothing", () => {
  const smoother = new TemporalPointSmoother(0.25);
  const start = smoother.next({ x: 0.2, y: 0.2 });
  assert.deepEqual(start, { x: 0.2, y: 0.2 });

  const smoothed = smoother.next({ x: 0.6, y: 0.6 });
  assert.ok(smoothed.x < 0.6);
  assert.ok(smoothed.y < 0.6);

  smoother.reset();
  const resetPoint = smoother.next({ x: 0.8, y: 0.8 });
  assert.deepEqual(resetPoint, { x: 0.8, y: 0.8 });
});

test("resolveSmoothedCenterOfGravity requires stable detections and holds briefly across dropouts", () => {
  const state = createCenterOfGravityOverlayState();
  const frame = createPoseFrame();

  const first = resolveSmoothedCenterOfGravity(frame, state);
  assert.equal(first, null);
  const second = resolveSmoothedCenterOfGravity(frame, state);
  assert.ok(second);

  const lowCoverage = createPoseFrame();
  delete lowCoverage.joints.leftHip;
  delete lowCoverage.joints.rightHip;
  delete lowCoverage.joints.leftKnee;
  delete lowCoverage.joints.rightKnee;
  delete lowCoverage.joints.leftAnkle;
  delete lowCoverage.joints.rightAnkle;

  const held = resolveSmoothedCenterOfGravity(lowCoverage, state);
  assert.ok(held);

  resolveSmoothedCenterOfGravity(lowCoverage, state);
  resolveSmoothedCenterOfGravity(lowCoverage, state);
  resolveSmoothedCenterOfGravity(lowCoverage, state);
  const hidden = resolveSmoothedCenterOfGravity(lowCoverage, state);
  assert.equal(hidden, null);
});

test("display rules are decoupled from drill mode and controlled by explicit enable flag", () => {
  assert.equal(shouldRenderCenterOfGravity({ enabled: true, mode: "drill", cameraView: "side" }), true);
  assert.equal(shouldRenderCenterOfGravity({ enabled: true, mode: "drill", cameraView: "front" }), true);
  assert.equal(shouldRenderCenterOfGravity({ enabled: true, mode: "freestyle", cameraView: "front" }), true);
  assert.equal(shouldRenderCenterOfGravity({ enabled: false, mode: "freestyle", cameraView: "front" }), false);
});

test("overlay state reset clears visibility and smoothing state", () => {
  const state = createCenterOfGravityOverlayState();
  const frame = createPoseFrame();
  resolveSmoothedCenterOfGravity(frame, state);
  resolveSmoothedCenterOfGravity(frame, state);
  assert.equal(state.visible, true);

  resetCenterOfGravityOverlayState(state);
  assert.equal(state.visible, false);
  assert.equal(state.lastStablePoint, null);
  assert.equal(state.stableDetections, 0);
  assert.equal(state.unstableDetections, 0);
});
