import test from "node:test";
import assert from "node:assert/strict";
import type { PortableDrill, PortablePhase, PortablePose } from "../schema/contracts.ts";
import { buildPhaseRuntimeModel, buildPhaseSimilarityWarnings } from "./phase-runtime.ts";
import { compareNormalizedJoints } from "./pose-comparison.ts";
import { scoreFramesAgainstDrillPhases } from "./frame-phase-scorer.ts";
import type { PoseFrame } from "../upload/types.ts";

function makePose(poseId: string, wristsY: number, elbowsY: number): PortablePose {
  return {
    poseId,
    timestampMs: 0,
    canvas: { coordinateSystem: "normalized-2d", widthRef: 1, heightRef: 1, view: "front" },
    joints: {
      leftShoulder: { x: 0.4, y: 0.35 },
      rightShoulder: { x: 0.6, y: 0.35 },
      leftElbow: { x: 0.35, y: elbowsY },
      rightElbow: { x: 0.65, y: elbowsY },
      leftWrist: { x: 0.33, y: wristsY },
      rightWrist: { x: 0.67, y: wristsY },
      leftHip: { x: 0.45, y: 0.65 },
      rightHip: { x: 0.55, y: 0.65 },
      leftKnee: { x: 0.46, y: 0.82 },
      rightKnee: { x: 0.54, y: 0.82 },
      leftAnkle: { x: 0.47, y: 0.96 },
      rightAnkle: { x: 0.53, y: 0.96 },
      nose: { x: 0.5, y: 0.2 }
    }
  };
}

function makeFrontViewDrill(): PortableDrill {
  const phases: PortablePhase[] = [
    { phaseId: "stand", order: 1, name: "Stand Straight", durationMs: 600, poseSequence: [makePose("stand", 0.62, 0.5)], assetRefs: [] },
    { phaseId: "flap", order: 2, name: "Flap", durationMs: 600, poseSequence: [makePose("flap", 0.46, 0.42)], assetRefs: [] },
    { phaseId: "hands_up", order: 3, name: "Hands Up", durationMs: 600, poseSequence: [makePose("hands_up", 0.22, 0.28)], assetRefs: [] }
  ];

  return {
    drillId: "front",
    slug: "front",
    title: "Front Drill",
    drillType: "rep",
    difficulty: "beginner",
    tags: [],
    primaryView: "front",
    phases,
    analysis: {
      measurementType: "rep",
      orderedPhaseSequence: ["stand", "flap", "hands_up"],
      criticalPhaseIds: ["stand", "flap", "hands_up"],
      allowedPhaseSkips: [],
      minimumConfirmationFrames: 2,
      exitGraceFrames: 1,
      minimumRepDurationMs: 300,
      cooldownMs: 150,
      entryConfirmationFrames: 2,
      minimumHoldDurationMs: 500
    }
  };
}

test("front-view distinct arm phases are not warned as overly similar", () => {
  const drill = makeFrontViewDrill();
  const model = buildPhaseRuntimeModel(drill, drill.analysis!);
  const warnings = buildPhaseSimilarityWarnings(drill, model);

  assert.equal(warnings.some((warning) => warning.phaseAId === "stand" && warning.phaseBId === "hands_up"), false);
  assert.equal(warnings.some((warning) => warning.phaseAId === "stand" && warning.phaseBId === "flap"), false);
  assert.equal(warnings.some((warning) => warning.phaseAId === "flap" && warning.phaseBId === "hands_up"), false);
});

test("few-joint side-view comparisons still detect meaningful change", () => {
  const sideA = {
    leftShoulder: { x: 0.4, y: 0.35 },
    rightShoulder: { x: 0.6, y: 0.35 },
    leftHip: { x: 0.45, y: 0.65 },
    rightHip: { x: 0.55, y: 0.65 },
    leftWrist: { x: 0.42, y: 0.62 }
  };
  const sideB = {
    ...sideA,
    leftWrist: { x: 0.42, y: 0.24 }
  };

  const metrics = compareNormalizedJoints(sideA, sideB, { normalizationDistance: 0.2 });
  assert.equal(metrics.jointCount, 5);
  assert.equal(metrics.isMeaningfullyDissimilar, true);
});

test("mean dilution regression: a few large-joint moves become distinct", () => {
  const base = {
    leftShoulder: { x: 0.4, y: 0.35 },
    rightShoulder: { x: 0.6, y: 0.35 },
    leftHip: { x: 0.45, y: 0.65 },
    rightHip: { x: 0.55, y: 0.65 },
    leftElbow: { x: 0.35, y: 0.5 },
    rightElbow: { x: 0.65, y: 0.5 },
    leftWrist: { x: 0.33, y: 0.62 },
    rightWrist: { x: 0.67, y: 0.62 },
    leftKnee: { x: 0.46, y: 0.82 },
    rightKnee: { x: 0.54, y: 0.82 },
    leftAnkle: { x: 0.47, y: 0.96 },
    rightAnkle: { x: 0.53, y: 0.96 }
  };
  const moved = {
    ...base,
    leftWrist: { x: 0.33, y: 0.2 },
    rightWrist: { x: 0.67, y: 0.2 },
    leftElbow: { x: 0.35, y: 0.3 }
  };

  const metrics = compareNormalizedJoints(base, moved, { normalizationDistance: 0.2 });
  assert.equal(metrics.isMeaningfullyDissimilar, true);
});

test("winner margin requires meaningful separation before selecting a phase", () => {
  const drill = makeFrontViewDrill();
  const phases = drill.phases;

  const frame: PoseFrame = {
    timestampMs: 0,
    joints: {
      leftShoulder: { x: 0.4, y: 0.35, confidence: 1 },
      rightShoulder: { x: 0.6, y: 0.35, confidence: 1 },
      leftElbow: { x: 0.35, y: 0.46, confidence: 1 },
      rightElbow: { x: 0.65, y: 0.46, confidence: 1 },
      leftWrist: { x: 0.33, y: 0.54, confidence: 1 },
      rightWrist: { x: 0.67, y: 0.54, confidence: 1 },
      leftHip: { x: 0.45, y: 0.65, confidence: 1 },
      rightHip: { x: 0.55, y: 0.65, confidence: 1 }
    }
  };

  const [scored] = scoreFramesAgainstDrillPhases([frame], phases, { includePerPhaseScores: true });
  assert.equal(scored?.bestPhaseId, null);
  assert.ok(Object.keys(scored?.perPhaseScores ?? {}).length >= 3);
});
