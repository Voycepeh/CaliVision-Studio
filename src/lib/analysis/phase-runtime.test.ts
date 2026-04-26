import test from "node:test";
import assert from "node:assert/strict";
import { buildPhaseRuntimeModel, buildPhaseSimilarityWarnings, buildRuntimePhaseLabelMap, getOrderedRuntimePhases } from "./phase-runtime.ts";
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

test("runtime model follows authored phase order even when legacy analysis order differs", () => {
  const drill = buildDrill(["top", "bottom"]);
  drill.phases = [
    { ...drill.phases[1]!, order: 1, phaseId: "bottom", name: "Bottom" },
    { ...drill.phases[0]!, order: 2, phaseId: "top", name: "Top" }
  ];
  const model = buildPhaseRuntimeModel(drill, drill.analysis!);

  assert.deepEqual(model.orderedPhaseIds, ["bottom", "top"]);
  assert.equal(model.loopLabel, "1. Bottom -> 2. Top -> 1. Bottom");
  assert.equal(model.legacyOrderMismatch, true);
});

test("runtime model includes newly added authored phase even when legacy analysis omits it", () => {
  const drill = buildDrill(["top", "bottom"]);
  drill.phases.push({
    phaseId: "extended",
    order: 3,
    name: "Extended",
    durationMs: 500,
    poseSequence: [{ poseId: "extended_pose", timestampMs: 0, canvas: { coordinateSystem: "normalized-2d", widthRef: 1, heightRef: 1, view: "side" }, joints: { leftWrist: { x: 0.4, y: 0.4 } } }],
    assetRefs: []
  });
  const model = buildPhaseRuntimeModel(drill, drill.analysis!);

  assert.deepEqual(model.orderedPhaseIds, ["top", "bottom", "extended"]);
  assert.equal(model.phaseCount, 3);
  assert.equal(model.legacyOrderMismatchDetails.includes("legacy_analysis_missing_authored_phase_ids"), true);
});

test("runtime model ignores stale legacy ids and keeps authored transitions", () => {
  const drill = buildDrill(["top", "removed", "bottom"]);
  const model = buildPhaseRuntimeModel(drill, drill.analysis!);

  assert.deepEqual(model.orderedPhaseIds, ["top", "bottom"]);
  assert.equal(model.allowedTransitionKeys.has("top->removed"), false);
  assert.equal(model.legacyOrderMismatchDetails.includes("legacy_analysis_contains_stale_phase_ids"), true);
});

test("similar phase warning flags near-duplicate poses", () => {
  const drill = buildDrill(["top", "bottom"]);
  const model = buildPhaseRuntimeModel(drill, drill.analysis!);
  const warnings = buildPhaseSimilarityWarnings(drill, model);

  assert.equal(warnings.length > 0, true);
  assert.equal(warnings[0]?.adjacentInLoop, true);
});

test("hold drill type forces hold runtime mode even if legacy analysis metadata still says rep", () => {
  const drill = buildDrill(["top", "bottom"]);
  drill.drillType = "hold";
  drill.analysis = {
    ...drill.analysis!,
    measurementType: "rep",
    targetHoldPhaseId: "bottom"
  };
  const model = buildPhaseRuntimeModel(drill, drill.analysis);

  assert.equal(model.measurementMode, "hold");
  assert.equal(model.measurementType, "hold");
  assert.equal(model.holdPhaseId, "bottom");
});

test("runtime display phases follow authored order and labels when analysis is present", () => {
  const drill = buildDrill(["top", "bottom"]);
  drill.phases = [
    { ...drill.phases[1]!, order: 1, phaseId: "bottom", name: "Bottom" },
    { ...drill.phases[0]!, order: 2, phaseId: "top", name: "Top" }
  ];

  const ordered = getOrderedRuntimePhases(drill);
  assert.deepEqual(ordered.map((phase) => phase.phaseId), ["bottom", "top"]);
  assert.deepEqual(ordered.map((phase) => phase.runtimeLabel), ["1. Bottom", "2. Top"]);
});

test("runtime display phases fallback to Phase N names when authored names are blank", () => {
  const drill = buildDrill(["top", "bottom"]);
  drill.analysis = undefined;
  drill.phases = drill.phases.map((phase) => ({ ...phase, name: "   ", title: "" }));

  const labels = buildRuntimePhaseLabelMap(drill);
  assert.deepEqual(labels, {
    top: "1. Phase 1",
    bottom: "2. Phase 2"
  });
});
