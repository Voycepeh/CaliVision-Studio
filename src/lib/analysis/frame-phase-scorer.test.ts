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

function makeFrameFromPose(
  pose: PortablePose,
  options: { timestampMs?: number; noise?: number; confidence?: number } = {}
): PoseFrame {
  const noise = options.noise ?? 0;
  const confidence = options.confidence ?? 0.9;
  const joints = Object.fromEntries(
    Object.entries(pose.joints).map(([jointName, joint]) => {
      const direction = jointName.length % 2 === 0 ? 1 : -1;
      return [
        jointName,
        {
          x: joint.x + noise * direction,
          y: joint.y - noise * direction,
          confidence
        }
      ];
    })
  );

  return {
    timestampMs: options.timestampMs ?? 0,
    joints
  } as PoseFrame;
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

test("front-view arm phases still separate under realistic noisy input", () => {
  const upPhasePose = makePose("up", 0.18);
  const downPhasePose = makePose("down", 0.86);
  const phases: PortablePhase[] = [
    { phaseId: "down", order: 1, name: "Down", durationMs: 300, poseSequence: [downPhasePose], assetRefs: [] },
    { phaseId: "up", order: 2, name: "Up", durationMs: 300, poseSequence: [upPhasePose], assetRefs: [] }
  ];

  const noisyUpFrame = makeFrameFromPose(upPhasePose, { noise: 0.015, confidence: 0.83 });
  const noisyDownFrame = makeFrameFromPose(downPhasePose, { noise: 0.015, confidence: 0.83 });

  const [upResult, downResult] = scoreFramesAgainstDrillPhases([noisyUpFrame, noisyDownFrame], phases, {
    cameraView: "front",
    includePerPhaseScores: true
  });

  assert.equal(upResult?.bestPhaseId, "up");
  assert.equal(downResult?.bestPhaseId, "down");
});

test("slightly ambiguous winner margins still produce runtime phase assignments", () => {
  const phases: PortablePhase[] = [
    { phaseId: "lowered", order: 1, name: "Lowered", durationMs: 300, poseSequence: [makePose("lowered", 0.32)], assetRefs: [] },
    { phaseId: "raised", order: 2, name: "Raised", durationMs: 300, poseSequence: [makePose("raised", 0.22)], assetRefs: [] }
  ];

  const ambiguousFrame = makeFrameFromPose(makePose("ambiguous", 0.26), { noise: 0.008, confidence: 0.78 });
  const [result] = scoreFramesAgainstDrillPhases([ambiguousFrame], phases, {
    cameraView: "front",
    minimumScoreThreshold: 0.35,
    includePerPhaseScores: true
  });

  assert.notEqual(result?.bestPhaseId, null);
});

test("valid short upload-style sequence does not collapse to all-null classifications", () => {
  const upPose = makePose("up", 0.2);
  const downPose = makePose("down", 0.85);
  const phases: PortablePhase[] = [
    { phaseId: "down", order: 1, name: "Down", durationMs: 300, poseSequence: [downPose], assetRefs: [] },
    { phaseId: "up", order: 2, name: "Up", durationMs: 300, poseSequence: [upPose], assetRefs: [] }
  ];

  const sequenceFrames: PoseFrame[] = [
    makeFrameFromPose(downPose, { timestampMs: 0, noise: 0.02, confidence: 0.76 }),
    makeFrameFromPose(makePose("mid-a", 0.58), { timestampMs: 33, noise: 0.02, confidence: 0.74 }),
    makeFrameFromPose(makePose("mid-b", 0.44), { timestampMs: 66, noise: 0.02, confidence: 0.74 }),
    makeFrameFromPose(upPose, { timestampMs: 99, noise: 0.02, confidence: 0.76 })
  ];

  const results = scoreFramesAgainstDrillPhases(sequenceFrames, phases, {
    cameraView: "front",
    minimumScoreThreshold: 0.3
  });

  const committed = results.filter((result) => result.bestPhaseId !== null);
  assert.equal(committed.length > 0, true);
  assert.equal(results[0]?.bestPhaseId, "down");
  assert.equal(results.at(-1)?.bestPhaseId, "up");
});

test("portrait runtime vs landscape-authored template preserves phase match after normalized scoring", () => {
  const upPhasePose = makePose("up_landscape", 0.2);
  const downPhasePose = makePose("down_landscape", 0.86);
  upPhasePose.canvas.widthRef = 16;
  upPhasePose.canvas.heightRef = 9;
  downPhasePose.canvas.widthRef = 16;
  downPhasePose.canvas.heightRef = 9;

  const phases: PortablePhase[] = [
    { phaseId: "down", order: 1, name: "Down", durationMs: 300, poseSequence: [downPhasePose], assetRefs: [] },
    { phaseId: "up", order: 2, name: "Up", durationMs: 300, poseSequence: [upPhasePose], assetRefs: [] }
  ];

  const portraitUpFrame = makeFrameFromPose(upPhasePose, { timestampMs: 0, noise: 0.01, confidence: 0.9 });
  portraitUpFrame.frameWidth = 720;
  portraitUpFrame.frameHeight = 1280;
  const [result] = scoreFramesAgainstDrillPhases([portraitUpFrame], phases, {
    cameraView: "front",
    includePerPhaseScores: true,
    minimumScoreThreshold: 0
  });
  assert.equal(result?.bestPhaseId, "up");
});

test("mirrored front-camera input aligns with authored template for phase scoring", () => {
  const upPhasePose = makePose("up", 0.2);
  const phases: PortablePhase[] = [
    { phaseId: "up", order: 1, name: "Up", durationMs: 300, poseSequence: [upPhasePose], assetRefs: [] }
  ];
  const mirroredFrame = makeFrameFromPose(upPhasePose, { noise: 0.01, confidence: 0.91 });
  mirroredFrame.mirrored = true;
  for (const jointName of Object.keys(mirroredFrame.joints)) {
    const key = jointName as keyof PoseFrame["joints"];
    const joint = mirroredFrame.joints[key];
    if (!joint) continue;
    mirroredFrame.joints[key] = { ...joint, x: 1 - joint.x };
  }
  const [result] = scoreFramesAgainstDrillPhases([mirroredFrame], phases, { cameraView: "front", minimumScoreThreshold: 0 });
  assert.equal(result?.bestPhaseId, "up");
});

test("arm-raise y deltas remain large after normalization", () => {
  const up = makePose("up", 0.2);
  const down = makePose("down", 0.86);
  const phases: PortablePhase[] = [
    { phaseId: "down", order: 1, name: "Down", durationMs: 300, poseSequence: [down], assetRefs: [] },
    { phaseId: "up", order: 2, name: "Up", durationMs: 300, poseSequence: [up], assetRefs: [] }
  ];
  const [result] = scoreFramesAgainstDrillPhases([makeFrameFromPose(up, { confidence: 0.9 })], phases, { cameraView: "front", includePerPhaseScores: true });
  const downDelta = result?.debug?.phaseComparisons.down?.perJointDelta.rightWrist ?? 0;
  const upDelta = result?.debug?.phaseComparisons.up?.perJointDelta.rightWrist ?? 1;
  assert.equal(downDelta > upDelta * 2, true);
});

test("hold target phase is rejected when hold threshold is not met", () => {
  const upPhasePose = makePose("hold_up", 0.18);
  const phases: PortablePhase[] = [
    { phaseId: "hold_up", order: 1, name: "Up Hold", durationMs: 300, poseSequence: [upPhasePose], assetRefs: [] }
  ];
  const noisyLowConfidenceFrame = makeFrameFromPose(upPhasePose, { noise: 0.09, confidence: 0.35 });
  const [result] = scoreFramesAgainstDrillPhases([noisyLowConfidenceFrame], phases, {
    cameraView: "front",
    holdTargetPhaseId: "hold_up",
    minimumScoreThreshold: 0
  });
  assert.equal(result?.bestPhaseId, null);
});

test("hands-down pose does not classify as hands-up hold target", () => {
  const upPose = makePose("up", 0.2);
  const downPose = makePose("down", 0.88);
  const phases: PortablePhase[] = [
    { phaseId: "up", order: 1, name: "Hands Up Hold", durationMs: 300, poseSequence: [upPose], assetRefs: [] }
  ];
  const [result] = scoreFramesAgainstDrillPhases([makeFrameFromPose(downPose, { confidence: 0.92 })], phases, {
    cameraView: "front",
    holdTargetPhaseId: "up",
    minimumScoreThreshold: 0
  });
  assert.equal(result?.bestPhaseId, null);
  assert.equal(result?.debug?.holdGate?.reason, "wrist_below_shoulder");
});
