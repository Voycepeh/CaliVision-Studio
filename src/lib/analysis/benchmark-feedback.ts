import type { BenchmarkComparisonResult, BenchmarkComparisonStatus } from "./benchmark-comparison.ts";

export type BenchmarkFeedbackCategory =
  | "sequence"
  | "timing"
  | "duration"
  | "consistency"
  | "benchmark_missing"
  | "attempt_missing_data";

export type BenchmarkFeedbackSeverity = "info" | "warning" | "success";

export type BenchmarkFeedbackItem = {
  category: BenchmarkFeedbackCategory;
  severity: BenchmarkFeedbackSeverity;
  title: string;
  description: string;
  recommendedAction?: string;
};

export type BenchmarkComparisonSummary = {
  label: string;
  description: string;
  severity: BenchmarkFeedbackSeverity;
};

export type BenchmarkCoachingFeedback = {
  summary: BenchmarkComparisonSummary;
  qualityBucket: BenchmarkComparisonResult["quality"]["bucket"] | "unknown";
  findings: BenchmarkFeedbackItem[];
  topFindings: BenchmarkFeedbackItem[];
  nextSteps: string[];
};

const DEFAULT_MAX_TOP_FINDINGS = 3;

export function formatPhaseSequenceSummary(
  comparison?: Partial<BenchmarkComparisonResult> | null
): string {
  const expectedCount = comparison?.phaseMatch?.expectedPhaseKeys?.length ?? 0;
  const matchedCount = comparison?.phaseMatch?.matchedCount ?? 0;
  const exactMatch = comparison?.phaseMatch?.matched === true;
  if (exactMatch) {
    return "Phase sequence matched.";
  }
  if (expectedCount <= 0) {
    return "Phase sequence unavailable.";
  }
  if (matchedCount > 0) {
    return `Matched ${Math.min(matchedCount, expectedCount)} of ${expectedCount} benchmark phases in order.`;
  }
  return "Phase sequence mismatch.";
}

export function getComparisonSeverity(
  comparison?: Partial<BenchmarkComparisonResult> | null
): BenchmarkFeedbackSeverity {
  const status = comparison?.status;
  if (status === "matched") {
    return "success";
  }
  if (status === "missing_benchmark" || status === "insufficient_attempt_data") {
    return "info";
  }
  if (status === "partial" || status === "phase_mismatch" || status === "timing_mismatch") {
    return "warning";
  }
  return "info";
}

export function summarizeBenchmarkComparison(
  comparison?: Partial<BenchmarkComparisonResult> | null
): BenchmarkComparisonSummary {
  const status = comparison?.status;
  const movementType = comparison?.movementType === "hold" ? "hold" : "rep";
  const severity = getComparisonSeverity(comparison);

  if (status === "matched") {
    return {
      label: "Benchmark aligned",
      description: movementType === "hold"
        ? "Phase sequence and hold timing matched the benchmark target."
        : "Phase sequence and rep timing matched the benchmark target.",
      severity
    };
  }

  if (status === "missing_benchmark") {
    return {
      label: "No benchmark available",
      description: "This drill does not have benchmark data yet, so comparison feedback is limited.",
      severity
    };
  }

  if (status === "insufficient_attempt_data") {
    return {
      label: "Need more attempt data",
      description: "Benchmark exists, but attempt data was too limited for a full comparison.",
      severity
    };
  }

  if (status === "phase_mismatch") {
    return {
      label: "Sequence needs work",
      description: "Phase sequence did not match the benchmark order.",
      severity
    };
  }

  if (status === "timing_mismatch") {
    return {
      label: "Timing needs work",
      description: movementType === "hold"
        ? "Hold timing was outside benchmark tolerance."
        : "Rep timing was outside benchmark tolerance.",
      severity
    };
  }

  if (status === "partial") {
    const sequenceMatched = comparison?.phaseMatch?.matched === true;
    const timingMissed = comparison?.timing?.present && comparison?.timing?.matched === false;
    return {
      label: "Partial benchmark match",
      description: sequenceMatched && timingMissed
        ? "Partial benchmark match: sequence matched, timing missed."
        : "Some benchmark checks matched, but key sequence or timing checks were outside target.",
      severity
    };
  }

  return {
    label: "Comparison ready",
    description: "Benchmark comparison is available.",
    severity
  };
}

export function getTopComparisonFindings(findings: BenchmarkFeedbackItem[], maxItems = DEFAULT_MAX_TOP_FINDINGS): BenchmarkFeedbackItem[] {
  return [...findings]
    .sort((a, b) => getFindingPriority(b) - getFindingPriority(a))
    .slice(0, Math.max(1, maxItems));
}

export function buildBenchmarkCoachingFeedback(input: {
  comparison?: Partial<BenchmarkComparisonResult> | null;
  maxPrimaryFindings?: number;
}): BenchmarkCoachingFeedback {
  const comparison = input.comparison;
  const findings = buildFindings(comparison);
  const topFindings = getTopComparisonFindings(findings, input.maxPrimaryFindings ?? DEFAULT_MAX_TOP_FINDINGS);

  const nextSteps = Array.from(
    new Set(
      topFindings
        .map((finding) => finding.recommendedAction)
        .filter((value): value is string => Boolean(value))
    )
  ).slice(0, 2);

  return {
    summary: summarizeBenchmarkComparison(comparison),
    qualityBucket: comparison?.quality?.bucket ?? "unknown",
    findings,
    topFindings,
    nextSteps
  };
}

function buildFindings(comparison?: Partial<BenchmarkComparisonResult> | null): BenchmarkFeedbackItem[] {
  if (!comparison) {
    return [
      {
        category: "attempt_missing_data",
        severity: "info",
        title: "Comparison not available",
        description: "No benchmark comparison was attached to this analysis.",
        recommendedAction: "Run the drill analysis again to generate benchmark feedback."
      }
    ];
  }

  const findings: BenchmarkFeedbackItem[] = [];
  const movementType = comparison.movementType === "hold" ? "hold" : "rep";

  if (comparison.status === "missing_benchmark") {
    findings.push({
      category: "benchmark_missing",
      severity: "info",
      title: "No benchmark configured",
      description: "This drill has no benchmark reference yet.",
      recommendedAction: "Add benchmark timing and phase targets in Drill Studio to unlock comparison coaching."
    });
    return findings;
  }

  if (comparison.status === "insufficient_attempt_data") {
    findings.push({
      category: "attempt_missing_data",
      severity: "info",
      title: "Attempt data too limited",
      description: "Benchmark exists, but this attempt did not provide enough analyzed data for full comparison.",
      recommendedAction: "Retake with your full body in frame and complete a full rep/hold cycle."
    });
    return findings;
  }

  if (comparison.phaseMatch && comparison.phaseMatch.matched === false) {
    const expectedCount = comparison.phaseMatch.expectedPhaseKeys?.length ?? 0;
    const matchedCount = Math.min(comparison.phaseMatch.matchedCount ?? 0, expectedCount);
    const hasExtraOrMissing = (comparison.phaseMatch.extraPhases?.length ?? 0) > 0 || (comparison.phaseMatch.missingPhases?.length ?? 0) > 0;
    const sequenceDescription = matchedCount > 0
      ? `Matched ${matchedCount} of ${expectedCount} benchmark phases in order${hasExtraOrMissing ? " with additional sequence differences." : "."}`
      : "Phase sequence mismatch.";
    findings.push({
      category: "sequence",
      severity: "warning",
      title: "Phase sequence mismatch",
      description: sequenceDescription,
      recommendedAction: "Focus on matching phase order before optimizing timing."
    });
  } else if (comparison.phaseMatch && comparison.phaseMatch.matched === true) {
    findings.push({
      category: "sequence",
      severity: "success",
      title: "Phase sequence matched",
      description: "Phase sequence matched the benchmark.",
      recommendedAction: "Keep this sequence consistency while refining timing."
    });
  }

  const aggregateTiming = describeAggregateTimingMismatch(comparison);
  if (aggregateTiming) {
    findings.push(aggregateTiming);
  } else if (comparison.timing?.present && comparison.timing.matched === true) {
    findings.push({
      category: "timing",
      severity: "success",
      title: "Timing matched",
      description: movementType === "hold"
        ? "Hold timing stayed within benchmark tolerance."
        : "Rep timing stayed within benchmark tolerance.",
      recommendedAction: "Maintain this pace and repeat for consistency."
    });
  } else if (comparison.timing?.present === false) {
    findings.push({
      category: "attempt_missing_data",
      severity: "info",
      title: "Timing comparison unavailable",
      description: "No benchmark timing target was available for this analysis.",
      recommendedAction: "Add benchmark timing targets to enable timing-focused coaching."
    });
  }

  const phaseTimingCompared = comparison.timing?.phaseTimingCompared ?? [];
  if (phaseTimingCompared.length > 0) {
    const mismatchedPhaseCount = phaseTimingCompared.filter((entry) => entry.withinTolerance === false).length;
    if (mismatchedPhaseCount > 0) {
      findings.push({
        category: "consistency",
        severity: mismatchedPhaseCount > 1 ? "warning" : "info",
        title: "Phase timing inconsistency",
        description: `${mismatchedPhaseCount} phase timing target${mismatchedPhaseCount === 1 ? " was" : "s were"} outside tolerance.`,
        recommendedAction: "Aim for steadier pace through each phase transition."
      });
    } else {
      findings.push({
        category: "consistency",
        severity: "success",
        title: "Phase timing consistency",
        description: "Compared phase timings were within tolerance.",
        recommendedAction: "Keep repeating this rhythm across attempts."
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      category: "attempt_missing_data",
      severity: "info",
      title: "Comparison partially available",
      description: "Some benchmark fields were missing, so only partial feedback could be generated."
    });
  }

  return findings;
}

function describeAggregateTimingMismatch(comparison: Partial<BenchmarkComparisonResult>): BenchmarkFeedbackItem | null {
  const timing = comparison.timing;
  if (!timing?.present || timing.matched !== false) {
    return null;
  }

  const movementType = comparison.movementType === "hold" ? "hold" : "rep";
  const expectedMs = movementType === "hold" ? timing.expectedHoldDurationMs : timing.expectedRepDurationMs;
  const actualMs = movementType === "hold" ? timing.actualHoldDurationMs : timing.actualRepDurationMs;

  if (!(typeof expectedMs === "number" && expectedMs > 0 && typeof actualMs === "number" && actualMs > 0)) {
    return {
      category: "timing",
      severity: "warning",
      title: "Timing outside target",
      description: movementType === "hold"
        ? "Hold timing was outside benchmark tolerance."
        : "Rep timing was outside benchmark tolerance.",
      recommendedAction: movementType === "hold"
        ? "Adjust hold pacing to land closer to the target duration."
        : "Adjust rep pace to land closer to benchmark timing."
    };
  }

  const ratioDelta = Math.abs(actualMs - expectedMs) / expectedMs;
  const majorGap = ratioDelta >= 0.3;

  if (movementType === "hold") {
    return {
      category: "duration",
      severity: "warning",
      title: actualMs < expectedMs ? "Hold too short" : "Hold too long",
      description: actualMs < expectedMs
        ? "Hold duration was shorter than the target."
        : "Hold duration was longer than the target.",
      recommendedAction: actualMs < expectedMs
        ? "Extend the hold before exiting the phase."
        : "Exit the hold phase closer to the target time."
    };
  }

  return {
    category: majorGap ? "duration" : "timing",
    severity: "warning",
    title: actualMs > expectedMs ? "Rep pace too slow" : "Rep pace too fast",
    description: actualMs > expectedMs
      ? "Rep timing was slower than the benchmark target."
      : "Rep timing was faster than the benchmark target.",
    recommendedAction: actualMs > expectedMs
      ? "Speed up transitions while keeping sequence clean."
      : "Slow down slightly to match the benchmark pace."
  };
}

function getFindingPriority(finding: BenchmarkFeedbackItem): number {
  const categoryScore: Record<BenchmarkFeedbackCategory, number> = {
    benchmark_missing: 100,
    attempt_missing_data: 95,
    sequence: 80,
    duration: 70,
    timing: 60,
    consistency: 40
  };
  const severityScore: Record<BenchmarkFeedbackSeverity, number> = {
    warning: 30,
    info: 20,
    success: 10
  };

  return categoryScore[finding.category] + severityScore[finding.severity];
}

export function isComparisonStatus(value: string | undefined): value is BenchmarkComparisonStatus {
  return [
    "matched",
    "partial",
    "missing_benchmark",
    "phase_mismatch",
    "timing_mismatch",
    "insufficient_attempt_data"
  ].includes(value ?? "");
}
