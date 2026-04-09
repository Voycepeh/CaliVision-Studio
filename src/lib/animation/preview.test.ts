import test from "node:test";
import assert from "node:assert/strict";
import { buildAnimationTimeline, sampleAnimationTimeline, sanitizeDurationMs } from "./preview.ts";
import type { PortableCanvasSpec, PortablePhase, PortablePose } from "../schema/contracts.ts";

const CANONICAL_FALLBACK_CANVAS: PortableCanvasSpec = {
  coordinateSystem: "normalized-2d",
  widthRef: 1000,
  heightRef: 1600,
  view: "front"
};

function createPose(poseId: string, x: number, y: number): PortablePose {
  return {
    poseId,
    timestampMs: 0,
    canvas: CANONICAL_FALLBACK_CANVAS,
    joints: {
      nose: { x, y, confidence: 1 }
    }
  };
}

function createPhase(phaseId: string, order: number, durationMs: number, pose: PortablePose): PortablePhase {
  return {
    phaseId,
    order,
    name: phaseId,
    durationMs,
    poseSequence: [pose],
    assetRefs: []
  };
}

test("exact phase boundary resolves to next segment", () => {
  const phases = [
    createPhase("phase_a", 1, 1000, createPose("pose_a", 0.1, 0.2)),
    createPhase("phase_b", 2, 1000, createPose("pose_b", 0.9, 0.8))
  ];

  const timeline = buildAnimationTimeline(phases);

  const frameAtBoundary = sampleAnimationTimeline(timeline, 1000);
  assert.equal(frameAtBoundary.phaseId, "phase_b");
  assert.equal(frameAtBoundary.phaseIndex, 1);
  assert.equal(frameAtBoundary.localProgress, 0);
});

test("samples frame inside segment with expected interpolation", () => {
  const phases = [
    createPhase("phase_a", 1, 1000, createPose("pose_a", 0.1, 0.2)),
    createPhase("phase_b", 2, 1000, createPose("pose_b", 0.9, 0.8))
  ];

  const timeline = buildAnimationTimeline(phases);
  const frame = sampleAnimationTimeline(timeline, 500);

  assert.equal(frame.phaseId, "phase_a");
  assert.equal(frame.localProgress, 0.5);
  assert.equal(frame.pose?.joints.nose?.x, 0.5);
  assert.equal(frame.pose?.joints.nose?.y, 0.5);
});

test("loop seam remains deterministic between terminal and wrapped timestamps", () => {
  const phases = [
    createPhase("phase_a", 1, 1000, createPose("pose_a", 0.1, 0.2)),
    createPhase("phase_b", 2, 1000, createPose("pose_b", 0.9, 0.8))
  ];

  const timeline = buildAnimationTimeline(phases);
  const frameAtEnd = sampleAnimationTimeline(timeline, timeline.totalDurationMs);
  const frameAfterWrap = sampleAnimationTimeline(timeline, 0);

  assert.equal(frameAtEnd.phaseId, "phase_b");
  assert.equal(frameAtEnd.localProgress, 1);
  assert.equal(frameAfterWrap.phaseId, "phase_a");
  assert.equal(frameAfterWrap.localProgress, 0);
});

test("durations below minimum are sanitized and surfaced in timeline metadata", () => {
  const phases = [createPhase("phase_short", 1, 10, createPose("pose_short", 0.2, 0.3))];
  const timeline = buildAnimationTimeline(phases);

  assert.equal(sanitizeDurationMs(10), 100);
  assert.equal(timeline.segments[0]?.durationMs, 100);
  assert.equal(timeline.segments[0]?.durationAdjusted, true);
  assert.match(timeline.warnings.map((warning) => warning.message).join("\n"), /clamps to 0.1s/);
});


test("phase preview labels use canonical name even when legacy title differs", () => {
  const phase = {
    phaseId: "phase_named",
    order: 1,
    name: "Canonical Name",
    title: "Legacy Title",
    durationMs: 1000,
    poseSequence: [createPose("pose_named", 0.3, 0.4)],
    assetRefs: []
  } as PortablePhase;

  const timeline = buildAnimationTimeline([phase]);
  const frame = sampleAnimationTimeline(timeline, 500);

  assert.equal(frame.phaseTitle, "Canonical Name");
  assert.match(timeline.segments[0]?.title ?? "", /Canonical Name/);
});
