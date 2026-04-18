import test from "node:test";
import assert from "node:assert/strict";
import { buildCompositeRepState, isRepSatisfiedAtTimestamp, isPhaseRuleSatisfied } from "./composite-rep.ts";
import type { PortableDrill } from "../schema/contracts.ts";

function buildDrill(): PortableDrill {
  return {
    drillId: "drill_1",
    title: "Paused push-up",
    drillType: "rep",
    difficulty: "beginner",
    tags: [],
    primaryView: "front",
    phases: [
      { phaseId: "top", order: 1, name: "Top", durationMs: 1, poseSequence: [], assetRefs: [] },
      {
        phaseId: "bottom",
        order: 2,
        name: "Bottom",
        durationMs: 1,
        poseSequence: [],
        assetRefs: [],
        analysis: { comparison: { isHoldPhase: true, durationMatters: true, minHoldDurationMs: 2000 } }
      },
      { phaseId: "top_return", order: 3, name: "Top", durationMs: 1, poseSequence: [], assetRefs: [] }
    ]
  };
}

test("phase rule supports phases without timing requirements", () => {
  assert.equal(
    isPhaseRuleSatisfied({
      phaseId: "top",
      observedDurationMs: 0,
      rule: { phaseId: "top", required: true, durationMatters: false, isHoldPhase: false }
    }),
    true
  );
});

test("phase rule enforces minimum hold duration when configured", () => {
  const rule = { phaseId: "bottom", required: true, durationMatters: true, isHoldPhase: true, minHoldDurationMs: 2000 };
  assert.equal(isPhaseRuleSatisfied({ phaseId: "bottom", observedDurationMs: 1500, rule }), false);
  assert.equal(isPhaseRuleSatisfied({ phaseId: "bottom", observedDurationMs: 2100, rule }), true);
});

test("composite rep requires sequence + required hold satisfaction", () => {
  const repState = buildCompositeRepState(buildDrill());

  assert.equal(
    isRepSatisfiedAtTimestamp({
      repState,
      enteredPhaseIds: ["top", "bottom", "top_return"],
      holdDurationByPhaseId: { bottom: 1900 }
    }),
    false
  );

  assert.equal(
    isRepSatisfiedAtTimestamp({
      repState,
      enteredPhaseIds: ["top", "bottom", "top_return"],
      holdDurationByPhaseId: { bottom: 2200 }
    }),
    true
  );
});

test("push-up style sequence-only drill counts without hold requirements", () => {
  const drill = buildDrill();
  drill.phases[1]!.analysis = { comparison: { isHoldPhase: false, durationMatters: false } };
  const repState = buildCompositeRepState(drill);

  assert.equal(
    isRepSatisfiedAtTimestamp({
      repState,
      enteredPhaseIds: ["top", "bottom", "top_return"],
      holdDurationByPhaseId: {}
    }),
    true
  );
});
