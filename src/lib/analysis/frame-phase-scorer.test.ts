import test from "node:test";
import assert from "node:assert/strict";
import { scoreFramesAgainstDrillPhases } from "./frame-phase-scorer.ts";
import type { PortablePhase } from "../schema/contracts.ts";

const phase: PortablePhase = {
  phaseId: "phase_1",
  order: 1,
  name: "Phase 1",
  durationMs: 500,
  poseSequence: [
    {
      poseId: "pose_1",
      timestampMs: 0,
      canvas: { coordinateSystem: "normalized-2d", widthRef: 1, heightRef: 1, view: "front" },
      joints: {
        rightShoulder: { x: 0.6, y: 0.3 },
        rightElbow: { x: 0.7, y: 0.5 },
        rightWrist: { x: 0.72, y: 0.7 },
        rightHip: { x: 0.62, y: 0.62 },
        rightKnee: { x: 0.64, y: 0.8 },
        rightAnkle: { x: 0.66, y: 0.95 },
        leftShoulder: { x: 0.4, y: 0.3 },
        leftElbow: { x: 0.3, y: 0.5 },
        leftWrist: { x: 0.28, y: 0.7 },
        leftHip: { x: 0.38, y: 0.62 },
        leftKnee: { x: 0.36, y: 0.8 },
        leftAnkle: { x: 0.34, y: 0.95 }
      }
    }
  ],
  assetRefs: []
};

test("classifier uses resolved camera view for default joint subset", () => {
  const frame = {
    timestampMs: 0,
    joints: {
      rightShoulder: { x: 0.6, y: 0.3, confidence: 1 },
      rightElbow: { x: 0.7, y: 0.5, confidence: 1 },
      rightWrist: { x: 0.72, y: 0.7, confidence: 1 },
      rightHip: { x: 0.62, y: 0.62, confidence: 1 },
      rightKnee: { x: 0.64, y: 0.8, confidence: 1 },
      rightAnkle: { x: 0.66, y: 0.95, confidence: 1 }
    }
  };

  const frontScore = scoreFramesAgainstDrillPhases([frame], [phase], { cameraView: "front" })[0]?.bestPhaseScore ?? 0;
  const sideScore = scoreFramesAgainstDrillPhases([frame], [phase], { cameraView: "side" })[0]?.bestPhaseScore ?? 0;

  assert.ok(frontScore > 0.8);
  assert.equal(sideScore, 0);
});
