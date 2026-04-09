import test from "node:test";
import assert from "node:assert/strict";
import { buildPhaseRuntimeModel } from "./phase-runtime.ts";
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
      { phaseId: "top", order: 1, name: "Top", durationMs: 500, poseSequence: [], assetRefs: [] },
      { phaseId: "bottom", order: 2, name: "Bottom", durationMs: 500, poseSequence: [], assetRefs: [] }
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

test("rep runtime model adds loop closure only when sequence is open", () => {
  const drill = buildDrill(["top", "bottom"]);
  const model = buildPhaseRuntimeModel(drill, drill.analysis!);

  assert.equal(model.allowedTransitionKeys.has("top->bottom"), true);
  assert.equal(model.allowedTransitionKeys.has("bottom->top"), true);
});

test("rep runtime model does not add synthetic self-transition for already closed sequence", () => {
  const drill = buildDrill(["top", "bottom", "top"]);
  const model = buildPhaseRuntimeModel(drill, drill.analysis!);

  assert.equal(model.allowedTransitionKeys.has("top->top"), false);
  assert.equal(model.allowedTransitionKeys.has("bottom->top"), true);
});
