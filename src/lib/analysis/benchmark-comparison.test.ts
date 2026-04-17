import test from "node:test";
import assert from "node:assert/strict";
import { compareAttemptToBenchmark, compareAttemptTimingToBenchmark } from "./benchmark-comparison.ts";
import type { AnalysisSessionRecord } from "./session-repository.ts";
import type { PortableDrill } from "../schema/contracts.ts";

function buildSession(partial?: Partial<AnalysisSessionRecord>): AnalysisSessionRecord {
  return {
    sessionId: "session_1",
    drillId: "drill_1",
    sourceKind: "upload",
    status: "completed",
    createdAtIso: "2026-04-17T00:00:00.000Z",
    summary: { analyzedDurationMs: 1200, repCount: 1, holdDurationMs: 0 },
    frameSamples: [{ timestampMs: 0, confidence: 0.9 }],
    events: [
      { eventId: "e1", timestampMs: 0, type: "phase_enter", phaseId: "phase_a" },
      { eventId: "e2", timestampMs: 400, type: "phase_enter", phaseId: "phase_b" },
      { eventId: "e3", timestampMs: 800, type: "phase_enter", phaseId: "phase_c" },
      { eventId: "e4", timestampMs: 1200, type: "rep_complete", repIndex: 1, details: { repDurationMs: 1200 } }
    ],
    ...partial
  };
}

function buildRepDrill(withBenchmark = true): PortableDrill {
  return {
    drillId: "drill_1",
    title: "Rep drill",
    drillType: "rep",
    difficulty: "beginner",
    tags: [],
    primaryView: "side",
    phases: [
      { phaseId: "phase_a", order: 1, name: "A", durationMs: 400, poseSequence: [], assetRefs: [] },
      { phaseId: "phase_b", order: 2, name: "B", durationMs: 400, poseSequence: [], assetRefs: [] },
      { phaseId: "phase_c", order: 3, name: "C", durationMs: 400, poseSequence: [], assetRefs: [] }
    ],
    benchmark: withBenchmark
      ? {
          sourceType: "seeded",
          movementType: "rep",
          phaseSequence: [
            { key: "phase_a", order: 1, targetDurationMs: 400 },
            { key: "phase_b", order: 2, targetDurationMs: 400 },
            { key: "phase_c", order: 3, targetDurationMs: 400 }
          ],
          timing: {
            expectedRepDurationMs: 1200,
            phaseDurationsMs: { phase_a: 400, phase_b: 400, phase_c: 400 }
          }
        }
      : null
  };
}

function buildHoldDrill(): PortableDrill {
  return {
    drillId: "hold_1",
    title: "Hold drill",
    drillType: "hold",
    difficulty: "beginner",
    tags: [],
    primaryView: "side",
    phases: [{ phaseId: "hold", order: 1, name: "Hold", durationMs: 1500, poseSequence: [], assetRefs: [] }],
    benchmark: {
      sourceType: "seeded",
      movementType: "hold",
      phaseSequence: [{ key: "hold", order: 1, targetDurationMs: 1500 }],
      timing: { targetHoldDurationMs: 1500, phaseDurationsMs: { hold: 1500 } }
    }
  };
}

test("returns missing_benchmark when drill benchmark is absent", () => {
  const result = compareAttemptToBenchmark({
    drill: buildRepDrill(false),
    session: buildSession()
  });

  assert.equal(result.status, "missing_benchmark");
  assert.equal(result.benchmarkPresent, false);
});

test("returns insufficient_attempt_data when analyzed attempt data is incomplete", () => {
  const result = compareAttemptToBenchmark({
    drill: buildRepDrill(true),
    session: buildSession({ frameSamples: [], summary: { analyzedDurationMs: 0 } })
  });

  assert.equal(result.status, "insufficient_attempt_data");
  assert.equal(result.benchmarkPresent, true);
});

test("rep drill sequence/timing can fully match benchmark", () => {
  const result = compareAttemptToBenchmark({
    drill: buildRepDrill(true),
    session: buildSession()
  });

  assert.equal(result.status, "matched");
  assert.equal(result.phaseMatch.matched, true);
  assert.equal(result.timing.matched, true);
});

test("rep drill with mismatched phase order returns phase_mismatch", () => {
  const session = buildSession({
    events: [
      { eventId: "e1", timestampMs: 0, type: "phase_enter", phaseId: "phase_a" },
      { eventId: "e2", timestampMs: 400, type: "phase_enter", phaseId: "phase_c" },
      { eventId: "e3", timestampMs: 800, type: "phase_enter", phaseId: "phase_b" },
      { eventId: "e4", timestampMs: 1200, type: "rep_complete", repIndex: 1, details: { repDurationMs: 1200 } }
    ]
  });

  const result = compareAttemptToBenchmark({ drill: buildRepDrill(true), session });
  assert.equal(result.status, "phase_mismatch");
  assert.equal(result.phaseMatch.matched, false);
});

test("hold drill duration shorter/longer than target can return timing_mismatch", () => {
  const shortSession = buildSession({
    summary: { analyzedDurationMs: 1000, holdDurationMs: 1000 },
    events: [
      { eventId: "h1", timestampMs: 0, type: "phase_enter", phaseId: "hold" },
      { eventId: "h2", timestampMs: 1000, type: "hold_end", phaseId: "hold", details: { durationMs: 1000 } }
    ]
  });

  const longSession = buildSession({
    summary: { analyzedDurationMs: 2100, holdDurationMs: 2100 },
    events: [
      { eventId: "h1", timestampMs: 0, type: "phase_enter", phaseId: "hold" },
      { eventId: "h2", timestampMs: 2100, type: "hold_end", phaseId: "hold", details: { durationMs: 2100 } }
    ]
  });

  const shortResult = compareAttemptToBenchmark({ drill: buildHoldDrill(), session: shortSession });
  const longResult = compareAttemptToBenchmark({ drill: buildHoldDrill(), session: longSession });

  assert.equal(shortResult.status, "timing_mismatch");
  assert.equal(longResult.status, "timing_mismatch");
});

test("timing comparison helper supports within/outside tolerance outcomes", () => {
  const within = compareAttemptTimingToBenchmark({
    movementType: "rep",
    phaseDurationsMs: { phase_a: 420 },
    actualRepDurationMs: 1220,
    benchmarkTiming: { expectedRepDurationMs: 1200, phaseDurationsMs: { phase_a: 400 } }
  });

  const outside = compareAttemptTimingToBenchmark({
    movementType: "rep",
    phaseDurationsMs: { phase_a: 650 },
    actualRepDurationMs: 1650,
    benchmarkTiming: { expectedRepDurationMs: 1200, phaseDurationsMs: { phase_a: 400 } }
  });

  assert.equal(within.matched, true);
  assert.equal(outside.matched, false);
});

test("can return partial state when phase mismatch and timing mismatch coexist", () => {
  const session = buildSession({
    summary: { analyzedDurationMs: 2100, repCount: 1 },
    events: [
      { eventId: "e1", timestampMs: 0, type: "phase_enter", phaseId: "phase_a" },
      { eventId: "e2", timestampMs: 700, type: "phase_enter", phaseId: "phase_c" },
      { eventId: "e3", timestampMs: 1500, type: "phase_enter", phaseId: "phase_b" },
      { eventId: "e4", timestampMs: 2100, type: "rep_complete", repIndex: 1, details: { repDurationMs: 2100 } }
    ]
  });

  const result = compareAttemptToBenchmark({ drill: buildRepDrill(true), session });
  assert.equal(result.status, "partial");
});

test("safe for partial benchmark payloads and legacy drill data", () => {
  const drill = buildRepDrill(true);
  drill.benchmark = {
    sourceType: "seeded",
    movementType: "rep",
    phaseSequence: [{ key: "phase_a", order: 1 }]
  };

  const result = compareAttemptToBenchmark({
    drill,
    session: buildSession({
      events: [{ eventId: "e1", timestampMs: 0, type: "phase_enter", phaseId: "phase_a" }]
    })
  });

  assert.equal(["matched", "phase_mismatch", "insufficient_attempt_data", "partial"].includes(result.status), true);
});
