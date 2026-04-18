import test from "node:test";
import assert from "node:assert/strict";
import { buildBenchmarkCoachingFeedback, getComparisonSeverity, getTopComparisonFindings, summarizeBenchmarkComparison } from "./benchmark-feedback.ts";
import type { BenchmarkComparisonResult } from "./benchmark-comparison.ts";

function buildComparison(partial?: Partial<BenchmarkComparisonResult>): BenchmarkComparisonResult {
  return {
    status: "matched",
    benchmarkPresent: true,
    movementType: "rep",
    phaseMatch: {
      expectedPhaseKeys: ["a", "b", "c"],
      actualPhaseKeys: ["a", "b", "c"],
      matched: true,
      matchedCount: 3,
      missingPhases: [],
      extraPhases: []
    },
    timing: {
      present: true,
      matched: true,
      expectedRepDurationMs: 1200,
      actualRepDurationMs: 1200,
      phaseTimingCompared: [
        { phaseKey: "a", expectedDurationMs: 400, actualDurationMs: 410, withinTolerance: true, toleranceMs: 120 }
      ]
    },
    quality: {
      bucket: "good",
      scoreBucket: "high",
      flags: []
    },
    reasons: [],
    ...partial
  };
}

test("matched comparison produces positive coaching feedback", () => {
  const feedback = buildBenchmarkCoachingFeedback({ comparison: buildComparison() });
  assert.equal(feedback.summary.severity, "success");
  assert.equal(feedback.topFindings.some((finding) => finding.severity === "success"), true);
});

test("phase mismatch prioritizes sequence-first guidance", () => {
  const feedback = buildBenchmarkCoachingFeedback({
    comparison: buildComparison({
      status: "phase_mismatch",
      phaseMatch: {
        expectedPhaseKeys: ["a", "b", "c"],
        actualPhaseKeys: ["a", "c", "b"],
        matched: false,
        matchedCount: 1,
        missingPhases: [],
        extraPhases: []
      },
      timing: { present: true, matched: false, expectedRepDurationMs: 1200, actualRepDurationMs: 1800, phaseTimingCompared: [] }
    })
  });

  assert.equal(feedback.topFindings[0]?.category, "sequence");
  assert.equal(feedback.nextSteps[0], "Focus on matching phase order before optimizing timing.");
});

test("timing mismatch produces timing guidance", () => {
  const feedback = buildBenchmarkCoachingFeedback({
    comparison: buildComparison({
      status: "timing_mismatch",
      timing: { present: true, matched: false, expectedRepDurationMs: 1200, actualRepDurationMs: 1700, phaseTimingCompared: [] }
    })
  });

  assert.equal(feedback.topFindings[0]?.category, "duration");
  assert.match(feedback.topFindings[0]?.description ?? "", /slower than the benchmark target/i);
});

test("hold mismatch returns shorter/longer hold messaging", () => {
  const shortFeedback = buildBenchmarkCoachingFeedback({
    comparison: buildComparison({
      movementType: "hold",
      status: "timing_mismatch",
      timing: { present: true, matched: false, expectedHoldDurationMs: 1500, actualHoldDurationMs: 900, phaseTimingCompared: [] }
    })
  });
  const longFeedback = buildBenchmarkCoachingFeedback({
    comparison: buildComparison({
      movementType: "hold",
      status: "timing_mismatch",
      timing: { present: true, matched: false, expectedHoldDurationMs: 1500, actualHoldDurationMs: 2200, phaseTimingCompared: [] }
    })
  });

  assert.match(shortFeedback.topFindings[0]?.description ?? "", /shorter than the target/i);
  assert.match(longFeedback.topFindings[0]?.description ?? "", /longer than the target/i);
});

test("missing benchmark returns benchmark_missing category messaging", () => {
  const feedback = buildBenchmarkCoachingFeedback({ comparison: buildComparison({ status: "missing_benchmark", benchmarkPresent: false }) });
  assert.equal(feedback.topFindings[0]?.category, "benchmark_missing");
  assert.equal(getComparisonSeverity(buildComparison({ status: "missing_benchmark" })), "info");
});

test("insufficient attempt data returns attempt_missing_data messaging", () => {
  const feedback = buildBenchmarkCoachingFeedback({ comparison: buildComparison({ status: "insufficient_attempt_data" }) });
  assert.equal(feedback.topFindings[0]?.category, "attempt_missing_data");
  assert.match(feedback.summary.description, /too limited for a full comparison/i);
});

test("prioritization limits surfaced findings to max of three", () => {
  const feedback = buildBenchmarkCoachingFeedback({
    comparison: buildComparison({
      status: "partial",
      phaseMatch: {
        expectedPhaseKeys: ["a", "b", "c"],
        actualPhaseKeys: ["a", "c", "x"],
        matched: false,
        matchedCount: 1,
        missingPhases: ["b"],
        extraPhases: ["x"]
      },
      timing: {
        present: true,
        matched: false,
        expectedRepDurationMs: 1200,
        actualRepDurationMs: 1800,
        phaseTimingCompared: [
          { phaseKey: "a", expectedDurationMs: 300, actualDurationMs: 620, withinTolerance: false, toleranceMs: 120 },
          { phaseKey: "b", expectedDurationMs: 300, actualDurationMs: 610, withinTolerance: false, toleranceMs: 120 }
        ]
      }
    }),
    maxPrimaryFindings: 3
  });

  assert.equal(feedback.topFindings.length <= 3, true);
  const explicitTop = getTopComparisonFindings(feedback.findings, 2);
  assert.equal(explicitTop.length, 2);
});

test("safe handling for partial comparison payloads", () => {
  const partialFeedback = buildBenchmarkCoachingFeedback({ comparison: { status: "partial", movementType: "rep" } });
  const summary = summarizeBenchmarkComparison({ status: "partial" });

  assert.equal(partialFeedback.topFindings.length > 0, true);
  assert.equal(summary.label, "Partial benchmark match");
});
