import test from "node:test";
import assert from "node:assert/strict";
import { runDrillAnalysisPipeline } from "./analysis-runner.ts";
import type { PortableDrill, PortablePhase, PortablePose } from "../schema/contracts.ts";
import type { PoseFrame } from "../upload/types.ts";

const SHOULDER_WIDTH = 0.3;

function makePose(poseId: string, timestampMs: number, wristY: number): PortablePose {
  return {
    poseId,
    timestampMs,
    canvas: { coordinateSystem: "normalized-2d", widthRef: 1, heightRef: 1, view: "side" },
    joints: {
      leftShoulder: { x: 0.35, y: 0.35 },
      rightShoulder: { x: 0.35 + SHOULDER_WIDTH, y: 0.35 },
      leftHip: { x: 0.4, y: 0.65 },
      rightHip: { x: 0.4 + SHOULDER_WIDTH, y: 0.65 },
      leftWrist: { x: 0.36, y: wristY },
      rightWrist: { x: 0.64, y: wristY }
    }
  };
}

function poseFrame(timestampMs: number, wristY: number, includeWrists = true): PoseFrame {
  return {
    timestampMs,
    joints: {
      leftShoulder: { x: 0.35, y: 0.35, confidence: 0.99 },
      rightShoulder: { x: 0.65, y: 0.35, confidence: 0.99 },
      leftHip: { x: 0.4, y: 0.65, confidence: 0.99 },
      rightHip: { x: 0.7, y: 0.65, confidence: 0.99 },
      ...(includeWrists
        ? {
            leftWrist: { x: 0.36, y: wristY, confidence: 0.99 },
            rightWrist: { x: 0.64, y: wristY, confidence: 0.99 }
          }
        : {})
    }
  };
}


function poseFrameRogue(timestampMs: number): PoseFrame {
  return {
    timestampMs,
    joints: {
      leftShoulder: { x: 0.2, y: 0.2, confidence: 0.99 },
      rightShoulder: { x: 0.8, y: 0.2, confidence: 0.99 },
      leftHip: { x: 0.3, y: 0.8, confidence: 0.99 },
      rightHip: { x: 0.7, y: 0.8, confidence: 0.99 },
      leftWrist: { x: 0.1, y: 0.45, confidence: 0.99 },
      rightWrist: { x: 0.9, y: 0.45, confidence: 0.99 }
    }
  };
}

function buildDrill(overrides: Partial<PortableDrill> = {}): PortableDrill {
  const phases: PortablePhase[] = [
    {
      phaseId: "top",
      order: 1,
      title: "Top",
      durationMs: 500,
      poseSequence: [makePose("p_top", 0, 0.2)],
      assetRefs: [],
      analysis: { matchHints: { requiredJoints: ["leftWrist", "rightWrist", "leftShoulder", "rightShoulder"] } }
    },
    {
      phaseId: "bottom",
      order: 2,
      title: "Bottom",
      durationMs: 500,
      poseSequence: [makePose("p_bottom", 500, 0.8)],
      assetRefs: [],
      analysis: { matchHints: { requiredJoints: ["leftWrist", "rightWrist", "leftShoulder", "rightShoulder"] } }
    }
  ];

  return {
    drillId: "d1",
    slug: "d1",
    title: "D1",
    drillType: "rep",
    difficulty: "beginner",
    tags: [],
    defaultView: "side",
    phases,
    analysis: {
      measurementType: "rep",
      orderedPhaseSequence: ["top", "bottom", "top"],
      criticalPhaseIds: ["top", "bottom"],
      allowedPhaseSkips: [],
      minimumConfirmationFrames: 2,
      exitGraceFrames: 1,
      minimumRepDurationMs: 250,
      cooldownMs: 500,
      entryConfirmationFrames: 2,
      minimumHoldDurationMs: 1000
    },
    ...overrides
  };
}

test("simple rep completion top->bottom->top", () => {
  const drill = buildDrill();
  const frames = [
    poseFrame(0, 0.2),
    poseFrame(100, 0.21),
    poseFrame(200, 0.8),
    poseFrame(300, 0.79),
    poseFrame(400, 0.2),
    poseFrame(500, 0.22)
  ];

  const result = runDrillAnalysisPipeline({ drill, sampledFrames: frames });
  assert.equal(result.session.summary.repCount, 1);
  assert.equal(result.session.events.filter((event) => event.type === "rep_complete").length, 1);
});

test("rep completion with valid explicit skip", () => {
  const drill = buildDrill({
    phases: [
      ...buildDrill().phases,
      {
        phaseId: "mid",
        order: 2,
        title: "Mid",
        durationMs: 400,
        poseSequence: [makePose("p_mid", 250, 0.5)],
        assetRefs: []
      }
    ],
    analysis: {
      ...buildDrill().analysis!,
      orderedPhaseSequence: ["top", "mid", "bottom", "top"],
      allowedPhaseSkips: [{ fromPhaseId: "top", toPhaseId: "bottom", skippedPhaseIds: ["mid"] }]
    }
  });

  const frames = [poseFrame(0, 0.2), poseFrame(100, 0.2), poseFrame(200, 0.8), poseFrame(300, 0.8), poseFrame(450, 0.2), poseFrame(550, 0.2)];
  const result = runDrillAnalysisPipeline({ drill, sampledFrames: frames });
  assert.equal(result.session.summary.repCount, 1);
});

test("invalid transition is not counted as rep", () => {
  const drill = buildDrill({
    phases: [
      ...buildDrill().phases,
      {
        phaseId: "rogue",
        order: 3,
        title: "Rogue",
        durationMs: 500,
        poseSequence: [{ ...makePose("p_rogue", 0, 0.4), joints: { ...makePose("p_rogue", 0, 0.4).joints, leftWrist: { x: 0.1, y: 0.45 }, rightWrist: { x: 0.9, y: 0.45 } } }],
        assetRefs: []
      }
    ],
    analysis: {
      ...buildDrill().analysis!,
      orderedPhaseSequence: ["top", "bottom", "top"],
      allowedPhaseSkips: []
    }
  });

  const frames = [poseFrame(0, 0.2), poseFrame(100, 0.2), poseFrameRogue(200), poseFrameRogue(300), poseFrame(400, 0.2), poseFrame(500, 0.2)];
  const result = runDrillAnalysisPipeline({ drill, sampledFrames: frames });

  assert.equal(result.session.summary.repCount, 0);
  assert.ok((result.session.summary.invalidTransitionCount ?? 0) >= 1);
});

test("hold start/end with grace dropout behavior", () => {
  const drill = buildDrill({
    drillType: "hold",
    analysis: {
      ...buildDrill().analysis!,
      measurementType: "hold",
      orderedPhaseSequence: ["bottom"],
      targetHoldPhaseId: "bottom",
      minimumHoldDurationMs: 250,
      minimumConfirmationFrames: 2,
      exitGraceFrames: 2
    }
  });

  const frames = [
    poseFrame(0, 0.8),
    poseFrame(100, 0.8),
    poseFrame(200, 0.8),
    poseFrame(300, 0.8, false),
    poseFrame(400, 0.8),
    poseFrame(500, 0.8),
    poseFrame(600, 0.2),
    poseFrame(700, 0.2)
  ];

  const result = runDrillAnalysisPipeline({ drill, sampledFrames: frames });
  assert.equal(result.session.events.filter((event) => event.type === "hold_start").length, 1);
  assert.equal(result.session.events.filter((event) => event.type === "hold_end").length, 1);
  assert.ok((result.session.summary.holdDurationMs ?? 0) >= 250);
});

test("cooldown prevents double-count reps", () => {
  const drill = buildDrill({
    analysis: {
      ...buildDrill().analysis!,
      cooldownMs: 700
    }
  });

  const frames = [
    poseFrame(0, 0.2), poseFrame(100, 0.2), poseFrame(200, 0.8), poseFrame(300, 0.8), poseFrame(450, 0.2), poseFrame(550, 0.2),
    poseFrame(650, 0.8), poseFrame(750, 0.8), poseFrame(850, 0.2), poseFrame(950, 0.2)
  ];

  const result = runDrillAnalysisPipeline({ drill, sampledFrames: frames });
  assert.equal(result.session.summary.repCount, 1);
  assert.ok((result.session.summary.partialAttemptCount ?? 0) >= 1);
});

test("unknown/low-confidence frames do not create false reps", () => {
  const drill = buildDrill();
  const frames = [
    poseFrame(0, 0.2),
    poseFrame(100, 0.2, false),
    poseFrame(200, 0.8, false),
    poseFrame(300, 0.2, false),
    poseFrame(400, 0.2)
  ];

  const result = runDrillAnalysisPipeline({ drill, sampledFrames: frames });
  assert.equal(result.session.summary.repCount, 0);
});
