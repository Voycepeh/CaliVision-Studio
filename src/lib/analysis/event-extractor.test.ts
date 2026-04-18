import test from "node:test";
import assert from "node:assert/strict";
import { extractAnalysisEvents } from "./event-extractor.ts";
import type { PortableDrill, PortablePose } from "../schema/contracts.ts";
import type { SmoothedPhaseFrame, SmootherTransition } from "./types.ts";

function makePose(poseId: string, timestampMs: number): PortablePose {
  return {
    poseId,
    timestampMs,
    canvas: { coordinateSystem: "normalized-2d", widthRef: 1, heightRef: 1, view: "side" },
    joints: {
      leftShoulder: { x: 0.35, y: 0.35 },
      rightShoulder: { x: 0.65, y: 0.35 },
      leftHip: { x: 0.4, y: 0.65 },
      rightHip: { x: 0.7, y: 0.65 },
      leftWrist: { x: 0.36, y: 0.8 },
      rightWrist: { x: 0.64, y: 0.8 }
    }
  };
}

function buildHoldDrill(phases: string[] = ["hold", "rest"]): PortableDrill {
  return {
    drillId: "hold-drill",
    slug: "hold-drill",
    title: "Hold Drill",
    drillType: "hold",
    difficulty: "beginner",
    tags: [],
    primaryView: "side",
    phases: phases.map((phaseId, index) => ({
      phaseId,
      order: index + 1,
      name: phaseId,
      durationMs: 500,
      poseSequence: [makePose(`pose_${phaseId}`, index * 500)],
      assetRefs: [],
      analysis: { matchHints: { requiredJoints: ["leftWrist", "rightWrist", "leftShoulder", "rightShoulder"] } }
    })),
    analysis: {
      measurementType: "hold",
      orderedPhaseSequence: phases,
      criticalPhaseIds: phases,
      targetHoldPhaseId: "hold",
      allowedPhaseSkips: [],
      minimumConfirmationFrames: 1,
      entryConfirmationFrames: 1,
      exitGraceFrames: 0,
      minimumHoldDurationMs: 1
    }
  };
}

function frame(timestampMs: number, phaseId: string | null): SmoothedPhaseFrame {
  return {
    timestampMs,
    rawBestPhaseId: phaseId,
    rawBestPhaseScore: phaseId ? 0.95 : 0,
    smoothedPhaseId: phaseId,
    transitionAccepted: true
  };
}

test("hold duration is nonzero when session starts in hold without explicit phase_enter", () => {
  const drill = buildHoldDrill(["hold"]);
  const smoothedFrames = [frame(0, "hold"), frame(100, "hold"), frame(200, "hold")];

  const result = extractAnalysisEvents(drill, smoothedFrames, []);

  assert.equal(result.summary.holdDurationMs, 200);
  const holdStart = result.events.find((event) => event.type === "hold_start");
  const holdEnd = result.events.find((event) => event.type === "hold_end");
  assert.equal(holdStart?.timestampMs, 0);
  assert.equal(holdStart?.details?.inferredSessionStart, true);
  assert.equal(holdEnd?.details?.inferredSessionEnd, true);
});

test("hold active at session start can end before clip end", () => {
  const drill = buildHoldDrill();
  const smoothedFrames = [frame(0, "hold"), frame(100, "hold"), frame(200, "rest"), frame(300, "rest")];
  const transitions: SmootherTransition[] = [{ timestampMs: 200, type: "phase_exit", phaseId: "hold" }];

  const result = extractAnalysisEvents(drill, smoothedFrames, transitions);

  assert.equal(result.summary.holdDurationMs, 200);
  const holdEnd = result.events.find((event) => event.type === "hold_end");
  assert.equal(holdEnd?.timestampMs, 200);
  assert.equal(holdEnd?.details?.inferredSessionEnd, undefined);
});

test("explicit mid-session phase_enter starts hold tracking", () => {
  const drill = buildHoldDrill();
  const smoothedFrames = [frame(0, "rest"), frame(100, "rest"), frame(200, "hold"), frame(300, "hold"), frame(400, "rest")];
  const transitions: SmootherTransition[] = [
    { timestampMs: 200, type: "phase_enter", phaseId: "hold" },
    { timestampMs: 400, type: "phase_exit", phaseId: "hold" }
  ];

  const result = extractAnalysisEvents(drill, smoothedFrames, transitions);

  assert.equal(result.summary.holdDurationMs, 200);
  const holdStarts = result.events.filter((event) => event.type === "hold_start");
  assert.equal(holdStarts.length, 1);
  assert.equal(holdStarts[0]?.timestampMs, 200);
  assert.equal(holdStarts[0]?.details?.inferredSessionStart, undefined);
});

test("active hold without explicit exit is closed at inferred session end", () => {
  const drill = buildHoldDrill();
  const smoothedFrames = [frame(0, "rest"), frame(100, "hold"), frame(200, "hold"), frame(300, "hold")];
  const transitions: SmootherTransition[] = [{ timestampMs: 100, type: "phase_enter", phaseId: "hold" }];

  const result = extractAnalysisEvents(drill, smoothedFrames, transitions);

  assert.equal(result.summary.holdDurationMs, 200);
  const holdEnd = result.events.find((event) => event.type === "hold_end");
  assert.equal(holdEnd?.timestampMs, 300);
  assert.equal(holdEnd?.details?.inferredSessionEnd, true);
});

test("mixed explicit transitions with start-in-hold do not double count", () => {
  const drill = buildHoldDrill();
  const smoothedFrames = [frame(0, "hold"), frame(100, "rest"), frame(200, "hold"), frame(300, "rest")];
  const transitions: SmootherTransition[] = [
    { timestampMs: 0, type: "phase_enter", phaseId: "hold" },
    { timestampMs: 100, type: "phase_exit", phaseId: "hold" },
    { timestampMs: 200, type: "phase_enter", phaseId: "hold" },
    { timestampMs: 300, type: "phase_exit", phaseId: "hold" }
  ];

  const result = extractAnalysisEvents(drill, smoothedFrames, transitions);

  assert.equal(result.summary.holdDurationMs, 200);
  const holdStarts = result.events.filter((event) => event.type === "hold_start");
  const holdEnds = result.events.filter((event) => event.type === "hold_end");
  assert.equal(holdStarts.length, 2);
  assert.equal(holdEnds.length, 2);
  assert.deepEqual(holdStarts.map((event) => event.timestampMs), [0, 200]);
});
