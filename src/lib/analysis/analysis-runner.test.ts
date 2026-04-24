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

function mirrorSideFrame(frame: PoseFrame): PoseFrame {
  const mirroredJoints = Object.entries(frame.joints).reduce<PoseFrame["joints"]>((acc, [jointName, joint]) => {
    if (!joint) return acc;
    const isLeft = jointName.startsWith("left");
    const isRight = jointName.startsWith("right");
    const mirroredJointName = isLeft
      ? (`right${jointName.slice(4)}` as keyof PoseFrame["joints"])
      : isRight
        ? (`left${jointName.slice(5)}` as keyof PoseFrame["joints"])
        : (jointName as keyof PoseFrame["joints"]);
    acc[mirroredJointName] = { ...joint, x: 1 - joint.x };
    return acc;
  }, {});
  return { ...frame, joints: mirroredJoints };
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
      name: "Top",
      durationMs: 500,
      poseSequence: [makePose("p_top", 0, 0.2)],
      assetRefs: [],
      analysis: { matchHints: { requiredJoints: ["leftWrist", "rightWrist", "leftShoulder", "rightShoulder"] } }
    },
    {
      phaseId: "bottom",
      order: 2,
      name: "Bottom",
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
    primaryView: "side",
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

function buildThreePhaseDrill(overrides: Partial<PortableDrill> = {}): PortableDrill {
  return buildDrill({
    phases: [
      {
        phaseId: "phase1",
        order: 1,
        name: "Phase 1",
        durationMs: 400,
        poseSequence: [makePose("p_phase1", 0, 0.2)],
        assetRefs: [],
        analysis: { matchHints: { requiredJoints: ["leftWrist", "rightWrist", "leftShoulder", "rightShoulder"] } }
      },
      {
        phaseId: "phase2",
        order: 2,
        name: "Phase 2",
        durationMs: 400,
        poseSequence: [makePose("p_phase2", 400, 0.5)],
        assetRefs: [],
        analysis: { matchHints: { requiredJoints: ["leftWrist", "rightWrist", "leftShoulder", "rightShoulder"] } }
      },
      {
        phaseId: "phase3",
        order: 3,
        name: "Phase 3",
        durationMs: 400,
        poseSequence: [makePose("p_phase3", 800, 0.8)],
        assetRefs: [],
        analysis: { matchHints: { requiredJoints: ["leftWrist", "rightWrist", "leftShoulder", "rightShoulder"] } }
      }
    ],
    analysis: {
      ...buildDrill().analysis!,
      orderedPhaseSequence: ["phase3", "legacy", "phase1", "phase2"],
      criticalPhaseIds: ["phase1", "phase2", "phase3"],
      minimumRepDurationMs: 240
    },
    ...overrides
  });
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

test("SIDE + REP resolves one rep for both left-facing and right-facing executions", () => {
  const drill = buildDrill();
  const leftFacingFrames = [
    poseFrame(0, 0.2),
    poseFrame(100, 0.2),
    poseFrame(200, 0.8),
    poseFrame(300, 0.8),
    poseFrame(450, 0.2),
    poseFrame(550, 0.2)
  ];
  const rightFacingFrames = leftFacingFrames.map(mirrorSideFrame);

  const leftResult = runDrillAnalysisPipeline({ drill, sampledFrames: leftFacingFrames, cameraView: "side" });
  const rightResult = runDrillAnalysisPipeline({ drill, sampledFrames: rightFacingFrames, cameraView: "side" });

  assert.equal(leftResult.session.summary.repCount, 1);
  assert.equal(rightResult.session.summary.repCount, 1);
  assert.equal(rightResult.scoredFrames.some((frame) => frame.debug?.sideOrientationModeByPhaseId?.top === "mirrored"), true);
});

test("two-phase ordered loop counts rep via implicit return transition", () => {
  const drill = buildDrill({
    analysis: {
      ...buildDrill().analysis!,
      orderedPhaseSequence: ["top", "bottom"]
    }
  });
  const frames = [
    poseFrame(0, 0.2),
    poseFrame(100, 0.2),
    poseFrame(300, 0.8),
    poseFrame(400, 0.8),
    poseFrame(600, 0.2),
    poseFrame(700, 0.2)
  ];

  const result = runDrillAnalysisPipeline({ drill, sampledFrames: frames });
  assert.equal(result.session.summary.repCount, 1);
});

test("rep completion with valid explicit skip", () => {
  const drill = buildDrill({
    phases: [
      buildDrill().phases[0]!,
      {
        phaseId: "mid",
        order: 2,
        name: "Mid",
        durationMs: 400,
        poseSequence: [makePose("p_mid", 250, 0.5)],
        assetRefs: []
      },
      {
        ...buildDrill().phases[1]!,
        order: 3
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
        name: "Rogue",
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
});



test("strict winner gating still preserves invalid transition accounting for confirmed rogue phase", () => {
  const drill = buildDrill({
    phases: [
      ...buildDrill().phases,
      {
        phaseId: "rogue",
        order: 3,
        name: "Rogue",
        durationMs: 500,
        poseSequence: [{
          ...makePose("p_rogue_confirmed", 0, 0.4),
          joints: {
            ...makePose("p_rogue_confirmed", 0, 0.4).joints,
            leftShoulder: { x: 0.15, y: 0.15 },
            rightShoulder: { x: 0.85, y: 0.15 },
            leftWrist: { x: 0.1, y: 0.1 },
            rightWrist: { x: 0.9, y: 0.1 }
          }
        }],
        assetRefs: []
      }
    ],
    analysis: {
      ...buildDrill().analysis!,
      orderedPhaseSequence: ["top", "bottom", "top"],
      allowedPhaseSkips: []
    }
  });

  const rogueFrame = (timestampMs: number): PoseFrame => ({
    timestampMs,
    joints: {
      leftShoulder: { x: 0.15, y: 0.15, confidence: 0.99 },
      rightShoulder: { x: 0.85, y: 0.15, confidence: 0.99 },
      leftHip: { x: 0.3, y: 0.8, confidence: 0.99 },
      rightHip: { x: 0.7, y: 0.8, confidence: 0.99 },
      leftWrist: { x: 0.1, y: 0.1, confidence: 0.99 },
      rightWrist: { x: 0.9, y: 0.1, confidence: 0.99 }
    }
  });

  const frames = [
    poseFrame(0, 0.2),
    poseFrame(100, 0.2),
    rogueFrame(200),
    rogueFrame(300),
    poseFrame(400, 0.2),
    poseFrame(500, 0.2)
  ];

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

test("SIDE + HOLD resolves hold duration for both left-facing and right-facing executions", () => {
  const drill = buildDrill({
    drillType: "hold",
    analysis: {
      ...buildDrill().analysis!,
      measurementType: "hold",
      orderedPhaseSequence: ["bottom"],
      targetHoldPhaseId: "bottom",
      minimumHoldDurationMs: 250,
      minimumConfirmationFrames: 2,
      exitGraceFrames: 1
    }
  });

  const leftFacingFrames = [
    poseFrame(0, 0.8),
    poseFrame(100, 0.8),
    poseFrame(200, 0.8),
    poseFrame(300, 0.8),
    poseFrame(500, 0.2),
    poseFrame(650, 0.2)
  ];
  const rightFacingFrames = leftFacingFrames.map(mirrorSideFrame);

  const leftResult = runDrillAnalysisPipeline({ drill, sampledFrames: leftFacingFrames, cameraView: "side" });
  const rightResult = runDrillAnalysisPipeline({ drill, sampledFrames: rightFacingFrames, cameraView: "side" });

  assert.ok((leftResult.session.summary.holdDurationMs ?? 0) >= 250);
  assert.ok((rightResult.session.summary.holdDurationMs ?? 0) >= 250);
  assert.equal(rightResult.scoredFrames.some((frame) => frame.debug?.sideOrientationModeByPhaseId?.bottom === "mirrored"), true);
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

test("temporary confidence drop still allows rep completion after stable recovery", () => {
  const drill = buildDrill();
  const frames = [
    poseFrame(0, 0.2),
    poseFrame(100, 0.2),
    poseFrame(200, 0.8),
    poseFrame(300, 0.8, false),
    poseFrame(400, 0.8),
    poseFrame(500, 0.8),
    poseFrame(700, 0.2),
    poseFrame(800, 0.2)
  ];

  const result = runDrillAnalysisPipeline({ drill, sampledFrames: frames });
  assert.equal(result.session.summary.repCount, 1);
  assert.equal(result.session.events.some((event) => event.type === "rep_complete"), true);
});

test("hold entryConfirmationFrames overrides generic confirmation for hold entry", () => {
  const drill = buildDrill({
    drillType: "hold",
    analysis: {
      ...buildDrill().analysis!,
      measurementType: "hold",
      orderedPhaseSequence: ["bottom"],
      targetHoldPhaseId: "bottom",
      minimumConfirmationFrames: 1,
      entryConfirmationFrames: 3,
      exitGraceFrames: 1,
      minimumHoldDurationMs: 100
    }
  });

  const frames = [poseFrame(0, 0.8), poseFrame(100, 0.8), poseFrame(200, 0.8), poseFrame(300, 0.8), poseFrame(400, 0.2), poseFrame(500, 0.2)];
  const result = runDrillAnalysisPipeline({ drill, sampledFrames: frames });

  const holdStart = result.session.events.find((event) => event.type === "hold_start");
  assert.ok(holdStart);
  assert.equal(holdStart?.timestampMs, 200);
});

test("hold summary duration is clamped by maxTimestampMs", () => {
  const drill = buildDrill({
    drillType: "hold",
    analysis: {
      ...buildDrill().analysis!,
      measurementType: "hold",
      orderedPhaseSequence: ["bottom"],
      targetHoldPhaseId: "bottom",
      minimumConfirmationFrames: 1,
      entryConfirmationFrames: 1,
      exitGraceFrames: 1,
      minimumHoldDurationMs: 0
    }
  });
  const frames = [poseFrame(0, 0.8), poseFrame(500, 0.8), poseFrame(1200, 0.8)];
  const result = runDrillAnalysisPipeline({ drill, sampledFrames: frames, maxTimestampMs: 800 });
  const holdEnd = result.session.events.find((event) => event.type === "hold_end");

  assert.equal(result.session.summary.analyzedDurationMs, 800);
  assert.equal(result.session.summary.holdDurationMs, 800);
  assert.equal(holdEnd?.timestampMs, 800);
});

test("phase scorer can match any authored pose in phase poseSequence", () => {
  const drill = buildDrill({
    phases: [
      {
        ...buildDrill().phases[0],
        phaseId: "top",
        poseSequence: [makePose("top_a", 0, 0.2), makePose("top_b", 100, 0.35)]
      },
      buildDrill().phases[1]
    ]
  });

  const result = runDrillAnalysisPipeline({
    drill,
    sampledFrames: [poseFrame(0, 0.35)]
  });

  assert.equal(result.scoredFrames[0].bestPhaseId, "top");
  assert.ok(result.scoredFrames[0].bestPhaseScore > 0.9);
});

test("rep drills with fewer than two phases do not count reps", () => {
  const singlePhase = buildDrill({
    phases: [buildDrill().phases[0]!],
    analysis: {
      ...buildDrill().analysis!,
      orderedPhaseSequence: ["top"]
    }
  });

  const frames = [poseFrame(0, 0.2), poseFrame(100, 0.2), poseFrame(200, 0.2)];
  const result = runDrillAnalysisPipeline({ drill: singlePhase, sampledFrames: frames });

  assert.equal(result.session.summary.repCount, 0);
  assert.equal(result.session.events.some((event) => event.type === "partial_attempt" && event.details?.reason === "insufficient_phase_count_for_rep"), true);
});

test("stale sequence ids are ignored and runtime loop uses authored phases only", () => {
  const drill = buildDrill({
    analysis: {
      ...buildDrill().analysis!,
      orderedPhaseSequence: ["top", "stale", "bottom", "top"]
    }
  });

  const frames = [
    poseFrame(0, 0.2),
    poseFrame(100, 0.2),
    poseFrame(250, 0.8),
    poseFrame(350, 0.8),
    poseFrame(500, 0.2),
    poseFrame(650, 0.2)
  ];

  const result = runDrillAnalysisPipeline({ drill, sampledFrames: frames });
  assert.equal(result.session.summary.repCount, 1);
});

test("runtime follows authored phase order when legacy analysis order is different", () => {
  const drill = buildDrill();
  drill.phases = [
    { ...drill.phases[1]!, order: 1, phaseId: "bottom", name: "Bottom" },
    { ...drill.phases[0]!, order: 2, phaseId: "top", name: "Top" }
  ];
  drill.analysis = {
    ...drill.analysis!,
    orderedPhaseSequence: ["top", "bottom"]
  };

  const frames = [
    poseFrame(0, 0.8),
    poseFrame(100, 0.8),
    poseFrame(250, 0.2),
    poseFrame(350, 0.2),
    poseFrame(500, 0.8),
    poseFrame(650, 0.8)
  ];

  const result = runDrillAnalysisPipeline({ drill, sampledFrames: frames });
  assert.equal(result.session.summary.repCount, 1);
});

test("valid repeated 3-phase authored loops continue counting reps beyond first loop", () => {
  const drill = buildThreePhaseDrill();
  const frames = [
    poseFrame(0, 0.2), poseFrame(100, 0.2),
    poseFrame(220, 0.5), poseFrame(320, 0.5),
    poseFrame(440, 0.8), poseFrame(540, 0.8),
    poseFrame(700, 0.2), poseFrame(800, 0.2),
    poseFrame(930, 0.5), poseFrame(1030, 0.5),
    poseFrame(1160, 0.8), poseFrame(1260, 0.8),
    poseFrame(1420, 0.2), poseFrame(1520, 0.2)
  ];

  const result = runDrillAnalysisPipeline({ drill, sampledFrames: frames });
  assert.equal(result.session.summary.repCount, 2);
  assert.equal(result.session.events.filter((event) => event.type === "rep_complete").length, 2);
  assert.equal(result.session.events.some((event) => event.type === "partial_attempt" && event.details?.reason === "below_minimum_rep_duration"), false);
});

test("reps are rejected only when genuinely below minimum duration threshold", () => {
  const drill = buildThreePhaseDrill({
    analysis: {
      ...buildThreePhaseDrill().analysis!,
      minimumRepDurationMs: 320
    }
  });
  const frames = [
    poseFrame(0, 0.2), poseFrame(40, 0.2),
    poseFrame(90, 0.5), poseFrame(130, 0.5),
    poseFrame(180, 0.8), poseFrame(220, 0.8),
    poseFrame(260, 0.2), poseFrame(300, 0.2),
    poseFrame(450, 0.5), poseFrame(550, 0.5),
    poseFrame(680, 0.8), poseFrame(780, 0.8),
    poseFrame(930, 0.2), poseFrame(1030, 0.2)
  ];

  const result = runDrillAnalysisPipeline({ drill, sampledFrames: frames });
  assert.equal(result.session.summary.repCount, 1);
  const rejected = result.session.events.find((event) => event.type === "partial_attempt" && event.details?.reason === "below_minimum_rep_duration");
  assert.ok(rejected);
  assert.equal(typeof rejected?.details?.loopStartTimestampMs, "number");
  assert.equal(typeof rejected?.details?.loopEndTimestampMs, "number");
  assert.equal(typeof rejected?.details?.repDurationMs, "number");
  assert.equal(rejected?.details?.minRepDurationMs, 320);
  assert.equal(rejected?.details?.rejectReason, "below_minimum_rep_duration");
});
