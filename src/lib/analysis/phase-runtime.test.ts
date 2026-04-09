import test from "node:test";
import assert from "node:assert/strict";
import { buildPhaseRuntimeModel, buildPhaseSimilarityWarnings } from "./phase-runtime.ts";
import type { PortableDrill } from "../schema/contracts.ts";

function buildDrill(orderedPhaseSequence: string[]): PortableDrill {
  return {
    drillId: "drill_runtime_model",
    slug: "drill-runtime-model",
    title: "Runtime Model Drill",
    drillType: "rep",
    difficulty: "beginner",
    tags: [],
    primaryView: "side",
    phases: [
      {
        phaseId: "top",
        order: 1,
        name: "Top",
        durationMs: 500,
        poseSequence: [{ poseId: "top_pose", timestampMs: 0, canvas: { coordinateSystem: "normalized-2d", widthRef: 1, heightRef: 1, view: "side" }, joints: { leftWrist: { x: 0.2, y: 0.2 } } }],
        assetRefs: []
      },
      {
        phaseId: "bottom",
        order: 2,
        name: "Bottom",
        durationMs: 500,
        poseSequence: [{ poseId: "bottom_pose", timestampMs: 0, canvas: { coordinateSystem: "normalized-2d", widthRef: 1, heightRef: 1, view: "side" }, joints: { leftWrist: { x: 0.21, y: 0.21 } } }],
        assetRefs: []
      }
    ],
    analysis: {
      measurementType: "rep",
      orderedPhaseSequence,
      criticalPhaseIds: ["top", "bottom"],
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

test("runtime model derives numbered labels and auto-closed loop", () => {
  const drill = buildDrill(["top", "bottom"]);
  const model = buildPhaseRuntimeModel(drill, drill.analysis!);

  assert.deepEqual(model.orderedPhaseIds, ["top", "bottom"]);
  assert.deepEqual(model.loopPhaseIds, ["top", "bottom", "top"]);
  assert.equal(model.phaseLabelById.top, "1. Top");
  assert.equal(model.phaseById.bottom?.hudLabel, "Phase 2/2 · Bottom");
  assert.equal(model.allowedTransitionKeys.has("top->bottom"), true);
  assert.equal(model.allowedTransitionKeys.has("bottom->top"), true);
});

test("runtime model deduplicates stale ordered sequence ids", () => {
  const drill = buildDrill(["top", "bottom", "top", "unknown"]);
  const model = buildPhaseRuntimeModel(drill, drill.analysis!);

  assert.deepEqual(model.orderedPhaseIds, ["top", "bottom"]);
  assert.equal(model.allowedTransitionKeys.has("top->top"), false);
});

test("similar phase warning flags near-duplicate poses", () => {
  const drill = buildDrill(["top", "bottom"]);
  const model = buildPhaseRuntimeModel(drill, drill.analysis!);
  const warnings = buildPhaseSimilarityWarnings(drill, model);

  assert.equal(warnings.length > 0, true);
  assert.equal(warnings[0]?.adjacentInLoop, true);
});
