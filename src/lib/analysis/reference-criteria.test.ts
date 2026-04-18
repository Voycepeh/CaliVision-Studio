import assert from "node:assert/strict";
import test from "node:test";
import type { AnalysisEvent, PortableDrill } from "../schema/contracts.ts";
import { buildCompositeRepState, buildDrillReferenceCriteria, getCompletedRepsSoFar, isPhaseRuleSatisfied, isRepSatisfiedAtTimestamp } from "./reference-criteria.ts";

function buildDrill(): PortableDrill {
  return {
    drillId: "drill_pushup",
    title: "Paused push-up",
    drillType: "rep",
    difficulty: "beginner",
    tags: [],
    primaryView: "side",
    phases: [
      { phaseId: "top_start", order: 1, name: "Top", durationMs: 600, poseSequence: [], assetRefs: [], analysis: { comparison: { required: true } } },
      { phaseId: "bottom", order: 2, name: "Bottom", durationMs: 600, poseSequence: [], assetRefs: [], analysis: { comparison: { required: true, holdRequired: true, minHoldDurationMs: 2000 } } },
      { phaseId: "top_end", order: 3, name: "Top return", durationMs: 600, poseSequence: [], assetRefs: [], analysis: { comparison: { required: true } } }
    ],
    benchmark: {
      sourceType: "seeded",
      phaseSequence: [{ key: "top_start", order: 1 }, { key: "bottom", order: 2 }, { key: "top_end", order: 3 }]
    }
  };
}

function eventsWithHold(durationMs: number): AnalysisEvent[] {
  return [
    { eventId: "e1", timestampMs: 0, type: "phase_enter", phaseId: "top_start" },
    { eventId: "e2", timestampMs: 600, type: "phase_enter", phaseId: "bottom" },
    { eventId: "e3", timestampMs: 700, type: "hold_start", phaseId: "bottom" },
    { eventId: "e4", timestampMs: 700 + durationMs, type: "hold_end", phaseId: "bottom", details: { durationMs } },
    { eventId: "e5", timestampMs: 800 + durationMs, type: "phase_enter", phaseId: "top_end" },
    { eventId: "e6", timestampMs: 900 + durationMs, type: "rep_complete", repIndex: 1 }
  ];
}

test("phase rule with no hold duration remains satisfiable by sequence only", () => {
  const criteria = buildDrillReferenceCriteria({
    ...buildDrill(),
    phases: [
      { phaseId: "top", order: 1, name: "Top", durationMs: 600, poseSequence: [], assetRefs: [], analysis: { comparison: { required: true } } },
      { phaseId: "bottom", order: 2, name: "Bottom", durationMs: 600, poseSequence: [], assetRefs: [], analysis: { comparison: { required: true } } }
    ]
  });
  const satisfied = isPhaseRuleSatisfied({ rule: criteria.phaseRules.bottom, reached: true, holdDurationsMs: [] });
  assert.equal(satisfied, true);
});

test("phase rule with min hold only satisfies when duration threshold is met", () => {
  const drill = buildDrill();
  const criteria = buildDrillReferenceCriteria(drill);
  assert.equal(isPhaseRuleSatisfied({ rule: criteria.phaseRules.bottom, reached: true, holdDurationsMs: [1800] }), false);
  assert.equal(isPhaseRuleSatisfied({ rule: criteria.phaseRules.bottom, reached: true, holdDurationsMs: [2200] }), true);
});

test("composite rep counts only when required hold phase is satisfied", () => {
  const criteria = buildDrillReferenceCriteria(buildDrill());
  const stateShort = buildCompositeRepState(criteria, eventsWithHold(1200), 2500);
  const stateLong = buildCompositeRepState(criteria, eventsWithHold(2200), 3500);
  assert.equal(stateShort.holdStatusByPhase.bottom.satisfied, false);
  assert.equal(stateLong.holdStatusByPhase.bottom.satisfied, true);
});

test("push-up style sequence-only rep logic remains deterministic", () => {
  const completed = getCompletedRepsSoFar({
    expectedSequence: ["top_start", "bottom", "top_end"],
    actualPhaseSequence: ["top_start", "bottom", "top_end", "top_start", "bottom", "top_end"]
  });
  assert.equal(completed, 2);
});

test("rep satisfaction checks required hold rules at timestamp", () => {
  const criteria = buildDrillReferenceCriteria(buildDrill());
  assert.equal(isRepSatisfiedAtTimestamp({ criteria, events: eventsWithHold(1000), timestampMs: 2600 }), false);
  assert.equal(isRepSatisfiedAtTimestamp({ criteria, events: eventsWithHold(2100), timestampMs: 3500 }), true);
});
