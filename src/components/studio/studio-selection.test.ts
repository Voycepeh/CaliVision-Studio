import test from "node:test";
import assert from "node:assert/strict";
import { chooseFallbackPhaseId } from "./studio-selection.ts";

test("deep-link selection logic does not reset when selected phase still exists", () => {
  const next = chooseFallbackPhaseId({
    selectedPhaseId: "phase_2",
    availablePhaseIds: ["phase_1", "phase_2", "phase_3"],
    previousPhaseIndexes: { phase_2: 1 }
  });

  assert.equal(next, "phase_2");
});

test("gracefully falls back to nearest phase index when selected phase is deleted", () => {
  const next = chooseFallbackPhaseId({
    selectedPhaseId: "phase_2",
    availablePhaseIds: ["phase_1", "phase_3", "phase_4"],
    previousPhaseIndexes: { phase_2: 1 }
  });

  assert.equal(next, "phase_3");
});

test("falls back to first phase when no historical phase index exists", () => {
  const next = chooseFallbackPhaseId({
    selectedPhaseId: "missing",
    availablePhaseIds: ["phase_1", "phase_2"],
    previousPhaseIndexes: {}
  });

  assert.equal(next, "phase_1");
});

test("returns null when package has no phases", () => {
  const next = chooseFallbackPhaseId({
    selectedPhaseId: "phase_1",
    availablePhaseIds: [],
    previousPhaseIndexes: { phase_1: 0 }
  });

  assert.equal(next, null);
});


test("falls back to first phase when no phase is currently selected", () => {
  const next = chooseFallbackPhaseId({
    selectedPhaseId: null,
    availablePhaseIds: ["phase_1", "phase_2"],
    previousPhaseIndexes: {}
  });

  assert.equal(next, "phase_1");
});
