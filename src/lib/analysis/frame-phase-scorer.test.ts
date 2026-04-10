import test from "node:test";
import assert from "node:assert/strict";
import { scoreFramesAgainstDrillPhases } from "./frame-phase-scorer.ts";
import type { PortablePhase, PortablePose } from "../schema/contracts.ts";
import type { PoseFrame } from "../upload/types.ts";

function makePose(poseId: string, rightWristY: number): PortablePose {
  return {
    poseId,
    timestampMs: 0,
    canvas: { coordinateSystem: "normalized-2d", widthRef: 1, heightRef: 1, view: "front" },
    joints: {
      nose: { x: 0.5, y: 0.2 },
      leftShoulder: { x: 0.4, y: 0.35 },
      rightShoulder: { x: 0.6, y: 0.35 },
      leftElbow: { x: 0.35, y: 0.48 },
      rightElbow: { x: 0.65, y: 0.48 },
      leftWrist: { x: 0.33, y: 0.18 },
      rightWrist: { x: 0.67, y: rightWristY },
      leftHip: { x: 0.45, y: 0.68 },
      rightHip: { x: 0.55, y: 0.68 },
      leftKnee: { x: 0.45, y: 0.82 },
      leftAnkle: { x: 0.45, y: 0.94 }
    }
  };
}

test("cameraView controls default joint subset used for scoring", () => {
  const phases: PortablePhase[] = [
    { phaseId: "profile_match", order: 1, name: "Profile", durationMs: 300, poseSequence: [makePose("a", 0.85)], assetRefs: [] },
    { phaseId: "front_match", order: 2, name: "Front", durationMs: 300, poseSequence: [makePose("b", 0.18)], assetRefs: [] }
  ];

  const frame: PoseFrame = {
    timestampMs: 0,
    joints: {
      nose: { x: 0.5, y: 0.2, confidence: 0.99 },
      leftShoulder: { x: 0.4, y: 0.35, confidence: 0.99 },
      rightShoulder: { x: 0.6, y: 0.35, confidence: 0.99 },
      leftElbow: { x: 0.35, y: 0.48, confidence: 0.99 },
      rightElbow: { x: 0.65, y: 0.48, confidence: 0.99 },
      leftWrist: { x: 0.33, y: 0.18, confidence: 0.99 },
      rightWrist: { x: 0.67, y: 0.18, confidence: 0.99 },
      leftHip: { x: 0.45, y: 0.68, confidence: 0.99 },
      rightHip: { x: 0.55, y: 0.68, confidence: 0.99 },
      leftKnee: { x: 0.45, y: 0.82, confidence: 0.99 },
      leftAnkle: { x: 0.45, y: 0.94, confidence: 0.99 }
    }
  };

  const [frontScored] = scoreFramesAgainstDrillPhases([frame], phases, { cameraView: "front", includePerPhaseScores: true, minimumScoreThreshold: 0 });
  const [sideScored] = scoreFramesAgainstDrillPhases([frame], phases, { cameraView: "side", includePerPhaseScores: true, minimumScoreThreshold: 0 });

  assert.equal(frontScored?.bestPhaseId, "front_match");
  assert.equal(
    (sideScored?.perPhaseScores.profile_match ?? 0) > (frontScored?.perPhaseScores.profile_match ?? 0),
    true
  );
});

test("side-view defaults remain profile-direction agnostic", () => {
  const phases: PortablePhase[] = [
    { phaseId: "down", order: 1, name: "Down", durationMs: 300, poseSequence: [makePose("down", 0.86)], assetRefs: [] },
    { phaseId: "up", order: 2, name: "Up", durationMs: 300, poseSequence: [makePose("up", 0.2)], assetRefs: [] }
  ];

  const rightProfileFrame: PoseFrame = {
    timestampMs: 0,
    joints: {
      nose: { x: 0.5, y: 0.2, confidence: 0.99 },
      rightShoulder: { x: 0.6, y: 0.35, confidence: 0.99 },
      rightElbow: { x: 0.65, y: 0.48, confidence: 0.99 },
      rightWrist: { x: 0.67, y: 0.2, confidence: 0.99 },
      rightHip: { x: 0.55, y: 0.68, confidence: 0.99 },
      rightKnee: { x: 0.55, y: 0.82, confidence: 0.99 },
      rightAnkle: { x: 0.55, y: 0.94, confidence: 0.99 },
      leftShoulder: { x: 0.4, y: 0.35, confidence: 0.99 },
      leftHip: { x: 0.45, y: 0.68, confidence: 0.99 }
    }
  };

  const [sideScored] = scoreFramesAgainstDrillPhases([rightProfileFrame], phases, {
    cameraView: "side",
    includePerPhaseScores: true,
    minimumScoreThreshold: 0
  });

  assert.equal((sideScored?.perPhaseScores.up ?? 0) > (sideScored?.perPhaseScores.down ?? 0), true);
});
