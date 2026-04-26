import test from "node:test";
import assert from "node:assert/strict";
import { buildCompareWorkspaceModel, deriveComparisonStatusView } from "./compare-model.ts";
import type { AnalysisSessionRecord } from "../analysis/session-repository.ts";
import type { PortableDrill } from "../schema/contracts.ts";
import type { BenchmarkCoachingFeedback } from "../analysis/benchmark-feedback.ts";
import type { CoachingFeedbackOutput } from "../analysis/coaching-feedback.ts";

function buildDrill(withBenchmark = true): PortableDrill {
  return {
    drillId: "d1",
    title: "Pike Push-up",
    drillType: "rep",
    difficulty: "beginner",
    tags: [],
    primaryView: "side",
    phases: [],
    benchmark: withBenchmark
      ? {
          sourceType: "reference_pose_sequence",
          label: "Coach benchmark"
        }
      : {
          sourceType: "none"
        }
  };
}

function buildSession(overrides?: Partial<AnalysisSessionRecord>): AnalysisSessionRecord {
  return {
    sessionId: "session-1",
    drillId: "d1",
    sourceKind: "upload",
    status: "completed",
    createdAtIso: new Date().toISOString(),
    summary: { repCount: 2, confidenceAvg: 0.81 },
    frameSamples: [{ timestampMs: 0, confidence: 0.8 }],
    events: [],
    benchmarkComparison: {
      status: "matched",
      benchmarkPresent: true,
      movementType: "rep",
      phaseMatch: {
        expectedPhaseKeys: ["start", "bottom"],
        actualPhaseKeys: ["start", "bottom"],
        matched: true,
        matchedCount: 2,
        missingPhases: [],
        extraPhases: []
      },
      timing: {
        present: true,
        matched: true,
        expectedRepDurationMs: 1000,
        actualRepDurationMs: 1040,
        phaseTimingCompared: []
      },
      quality: {
        bucket: "good",
        scoreBucket: "high",
        flags: []
      },
      reasons: []
    },
    ...overrides
  };
}

const benchmarkFeedback: BenchmarkCoachingFeedback = {
  summary: {
    label: "Benchmark aligned",
    description: "Sequence and timing matched.",
    severity: "success"
  },
  qualityBucket: "good",
  findings: [],
  topFindings: [
    { category: "sequence", severity: "success", title: "Sequence matched", description: "Good sequence." }
  ],
  nextSteps: []
};

const coachingFeedback: CoachingFeedbackOutput = {
  summaryLabel: "Coach ready",
  summaryDescription: "Summary",
  positives: [],
  primaryIssue: {
    id: "timing",
    title: "Timing cue",
    description: "Slow the descent and hold the bottom longer.",
    severity: "warning",
    category: "timing",
    cueText: "Control down phase",
    visualGuides: []
  },
  improvements: [
    {
      id: "hips",
      title: "Hips drop",
      description: "Keep hips stacked.",
      severity: "warning",
      category: "support",
      bodyRegion: "hips",
      cueText: "Brace core",
      visualGuides: []
    }
  ],
  bodyPartBreakdown: [{ bodyPart: "Shoulders", observation: "", correction: "Stay protracted", visualGuides: [] }],
  orderedFixSteps: [],
  nextSteps: [],
  visualGuides: []
};

test("missing benchmark returns empty state", () => {
  const model = buildCompareWorkspaceModel({
    drill: buildDrill(false),
    analysisSession: buildSession({
      benchmarkComparison: {
        ...buildSession().benchmarkComparison!,
        benchmarkPresent: false,
        status: "missing_benchmark"
      }
    })
  });

  assert.equal(model.emptyState?.title, "No benchmark configured");
  assert.equal(model.emptyState?.kind, "no_benchmark");
});

test("no attempt returns empty state", () => {
  const model = buildCompareWorkspaceModel({
    drill: buildDrill(true)
  });

  assert.equal(model.emptyState?.title, "No analyzed attempt selected");
  assert.equal(model.emptyState?.kind, "no_attempt");
});

test("matched benchmark produces status summary", () => {
  const model = buildCompareWorkspaceModel({
    drill: buildDrill(true),
    analysisSession: buildSession(),
    benchmarkFeedback
  });

  assert.equal(model.comparisonStatus, "Benchmark aligned");
});

test("timing mismatch produces timing row", () => {
  const model = buildCompareWorkspaceModel({
    drill: buildDrill(true),
    analysisSession: buildSession({
      benchmarkComparison: {
        ...buildSession().benchmarkComparison!,
        status: "timing_mismatch",
        timing: {
          present: true,
          matched: false,
          expectedRepDurationMs: 1000,
          actualRepDurationMs: 1800,
          phaseTimingCompared: []
        }
      }
    })
  });

  assert.ok(model.metricRows.some((row) => row.id === "timing_status" && row.severity === "warning"));
});

test("hold duration mismatch produces hold duration row", () => {
  const model = buildCompareWorkspaceModel({
    drill: { ...buildDrill(true), drillType: "hold" },
    analysisSession: buildSession({
      benchmarkComparison: {
        ...buildSession().benchmarkComparison!,
        movementType: "hold",
        timing: {
          present: true,
          matched: false,
          expectedHoldDurationMs: 1500,
          actualHoldDurationMs: 900,
          phaseTimingCompared: []
        }
      }
    })
  });

  assert.ok(model.metricRows.some((row) => row.id === "hold_duration_diff"));
  assert.equal(model.metricRows.some((row) => row.id === "completed_reps"), false);
  assert.ok(model.metricRows.some((row) => row.id === "hold_detected"));
});

test("phase timing compared produces phase rows", () => {
  const model = buildCompareWorkspaceModel({
    drill: buildDrill(true),
    analysisSession: buildSession({
      benchmarkComparison: {
        ...buildSession().benchmarkComparison!,
        timing: {
          present: true,
          matched: false,
          phaseTimingCompared: [
            {
              phaseKey: "bottom",
              expectedDurationMs: 300,
              actualDurationMs: 550,
              withinTolerance: false,
              toleranceMs: 120
            }
          ]
        }
      }
    })
  });

  assert.ok(model.metricRows.some((row) => row.id === "phase_timing_bottom" && row.label === "Phase timing: bottom"));
});

test("generated phase ids are shown as readable phase labels", () => {
  const model = buildCompareWorkspaceModel({
    drill: buildDrill(true),
    analysisSession: buildSession({
      benchmarkComparison: {
        ...buildSession().benchmarkComparison!,
        phaseMatch: {
          ...buildSession().benchmarkComparison!.phaseMatch,
          expectedPhaseKeys: ["phase_002"]
        },
        timing: {
          present: true,
          matched: false,
          phaseTimingCompared: [
            {
              phaseKey: "phase_002",
              expectedDurationMs: 300,
              actualDurationMs: 550,
              withinTolerance: false,
              toleranceMs: 120
            }
          ]
        }
      }
    })
  });

  assert.ok(model.metricRows.some((row) => row.id === "phase_timing_phase_002" && row.label === "Phase timing: Phase 1"));
});

test("hold status uses hold-specific wording", () => {
  const status = deriveComparisonStatusView({
    analysisSession: buildSession({
      benchmarkComparison: {
        ...buildSession().benchmarkComparison!,
        movementType: "hold",
        phaseMatch: {
          ...buildSession().benchmarkComparison!.phaseMatch,
          matched: true
        },
        timing: {
          present: true,
          matched: false,
          expectedHoldDurationMs: 1500,
          actualHoldDurationMs: 800,
          phaseTimingCompared: []
        }
      }
    })
  });

  assert.equal(status.label, "Hold aligned, duration outside target");
  assert.equal(status.timingLabel, "Benchmark duration target available");
});

test("deriveComparisonStatusView treats full ordered phase match as sequence matched even when matched flag is false", () => {
  const status = deriveComparisonStatusView({
    analysisSession: buildSession({
      benchmarkComparison: {
        ...buildSession().benchmarkComparison!,
        status: "partial",
        phaseMatch: {
          expectedPhaseKeys: ["start", "bottom", "finish"],
          actualPhaseKeys: ["start", "bottom", "finish"],
          matched: false,
          matchedCount: 3,
          missingPhases: [],
          extraPhases: []
        },
        timing: {
          present: true,
          matched: false,
          expectedRepDurationMs: 1000,
          actualRepDurationMs: 1600,
          phaseTimingCompared: []
        }
      }
    })
  });

  assert.equal(status.label, "Sequence matched, timing outside tolerance");
});

test("no fake overall score when no numeric score exists", () => {
  const model = buildCompareWorkspaceModel({
    drill: buildDrill(true),
    analysisSession: buildSession()
  });

  assert.equal(model.overallMatchScore, undefined);
});

test("top takeaway comes from coaching feedback", () => {
  const model = buildCompareWorkspaceModel({
    drill: buildDrill(true),
    analysisSession: buildSession(),
    benchmarkFeedback,
    coachingFeedback
  });

  assert.equal(model.topTakeaway, "Slow the descent and hold the bottom longer.");
});

test("focus areas come from bodyPartBreakdown and improvements", () => {
  const model = buildCompareWorkspaceModel({
    drill: buildDrill(true),
    analysisSession: buildSession(),
    benchmarkFeedback,
    coachingFeedback
  });

  assert.ok(model.focusAreas.includes("Shoulders"));
  assert.ok(model.focusAreas.includes("Hips"));
});
