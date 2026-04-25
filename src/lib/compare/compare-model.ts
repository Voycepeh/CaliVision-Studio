import type { BenchmarkCoachingFeedback } from "@/lib/analysis/benchmark-feedback";
import type { CoachingFeedbackOutput } from "@/lib/analysis/coaching-feedback";
import type { AnalysisSessionRecord } from "@/lib/analysis/session-repository";
import type { PortableDrill } from "@/lib/schema/contracts";

export type CompareMetricRow = {
  id: string;
  label: string;
  benchmarkValue: string;
  attemptValue: string;
  differenceValue?: string;
  severity: "success" | "info" | "warning";
  available: boolean;
};

export type CompareEmptyState = {
  kind: "no_benchmark" | "no_attempt" | "insufficient_data";
  title: string;
  description: string;
  actionLabel?: string;
};

export type CompareWorkspaceModel = {
  drillLabel: string;
  benchmarkLabel: string;
  attemptLabel: string;
  comparisonStatus: string;
  overallMatchScore?: number;
  topTakeaway: string;
  focusAreas: string[];
  metricRows: CompareMetricRow[];
  emptyState?: CompareEmptyState;
};

export function buildCompareWorkspaceModel(input: {
  drill?: PortableDrill | null;
  analysisSession?: AnalysisSessionRecord | null;
  benchmarkFeedback?: BenchmarkCoachingFeedback | null;
  coachingFeedback?: CoachingFeedbackOutput | null;
}): CompareWorkspaceModel {
  const comparison = input.analysisSession?.benchmarkComparison;
  const benchmarkPresent = Boolean(input.drill?.benchmark && input.drill.benchmark.sourceType !== "none")
    || comparison?.benchmarkPresent === true;
  const hasAttempt = Boolean(input.analysisSession);

  const comparisonStatus = input.benchmarkFeedback?.summary.label
    ?? (comparison ? mapStatusLabel(comparison.status) : "Comparison unavailable");

  if (!benchmarkPresent) {
    return {
      drillLabel: input.drill?.title ?? input.analysisSession?.drillTitle ?? "Selected drill",
      benchmarkLabel: "Benchmark",
      attemptLabel: "Your attempt",
      comparisonStatus,
      topTakeaway: "Add benchmark data in Drill Studio to unlock benchmark comparison.",
      focusAreas: ["Benchmark"],
      metricRows: [],
      emptyState: {
        kind: "no_benchmark",
        title: "No benchmark configured",
        description: "Add benchmark timing or reference phases in Drill Studio to compare attempts.",
        actionLabel: "Open Drill Studio"
      }
    };
  }

  if (!hasAttempt) {
    return {
      drillLabel: input.drill?.title ?? "Selected drill",
      benchmarkLabel: input.drill?.benchmark?.label ?? "Benchmark",
      attemptLabel: "Your attempt",
      comparisonStatus,
      topTakeaway: "Run upload or live analysis, then open Compare from the result.",
      focusAreas: ["Visibility"],
      metricRows: [],
      emptyState: {
        kind: "no_attempt",
        title: "No analyzed attempt selected",
        description: "Run upload or live analysis, then open Compare from the result."
      }
    };
  }

  const analysisSession = input.analysisSession;
  if (!analysisSession) {
    return {
      drillLabel: input.drill?.title ?? "Selected drill",
      benchmarkLabel: input.drill?.benchmark?.label ?? "Benchmark",
      attemptLabel: "Your attempt",
      comparisonStatus,
      topTakeaway: "Run upload or live analysis, then open Compare from the result.",
      focusAreas: ["Visibility"],
      metricRows: []
    };
  }

  if (comparison?.status === "insufficient_attempt_data") {
    return {
      drillLabel: input.drill?.title ?? analysisSession.drillTitle ?? "Selected drill",
      benchmarkLabel: input.drill?.benchmark?.label ?? "Benchmark",
      attemptLabel: analysisSession.sourceLabel ?? "Your attempt",
      comparisonStatus,
      topTakeaway: input.coachingFeedback?.primaryIssue?.description
        ?? input.benchmarkFeedback?.topFindings[0]?.description
        ?? "Keep the full body in frame and complete a full rep or hold.",
      focusAreas: deriveFocusAreas(input.coachingFeedback, input.benchmarkFeedback),
      metricRows: buildMetricRows(analysisSession, input.benchmarkFeedback),
      emptyState: {
        kind: "insufficient_data",
        title: "Not enough comparison data",
        description: "Keep the full body in frame and complete a full rep or hold to unlock comparison."
      }
    };
  }

  return {
    drillLabel: input.drill?.title ?? analysisSession.drillTitle ?? "Selected drill",
    benchmarkLabel: input.drill?.benchmark?.label ?? "Benchmark",
    attemptLabel: analysisSession.sourceLabel ?? "Your attempt",
    comparisonStatus,
    overallMatchScore: undefined,
    topTakeaway: input.coachingFeedback?.primaryIssue?.description
      ?? input.benchmarkFeedback?.topFindings[0]?.description
      ?? input.benchmarkFeedback?.summary.description
      ?? "Comparison generated from benchmark and attempt data.",
    focusAreas: deriveFocusAreas(input.coachingFeedback, input.benchmarkFeedback),
    metricRows: buildMetricRows(analysisSession, input.benchmarkFeedback)
  };
}

function mapStatusLabel(status?: string): string {
  if (status === "matched") return "Benchmark aligned";
  if (status === "timing_mismatch") return "Timing needs work";
  if (status === "phase_mismatch") return "Sequence needs work";
  if (status === "partial") return "Partial benchmark match";
  if (status === "insufficient_attempt_data") return "Need more attempt data";
  if (status === "missing_benchmark") return "No benchmark available";
  return "Comparison ready";
}

function formatMs(value?: number): string {
  if (!(typeof value === "number") || !Number.isFinite(value) || value < 0) {
    return "—";
  }
  return `${(value / 1000).toFixed(2)}s`;
}

function formatDelta(expected?: number, actual?: number): string | undefined {
  if (!(typeof expected === "number") || !(typeof actual === "number")) {
    return undefined;
  }
  const delta = actual - expected;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${(delta / 1000).toFixed(2)}s`;
}

function toSeverity(withinTolerance?: boolean): CompareMetricRow["severity"] {
  if (withinTolerance === true) return "success";
  if (withinTolerance === false) return "warning";
  return "info";
}

function buildMetricRows(session: AnalysisSessionRecord, benchmarkFeedback?: BenchmarkCoachingFeedback | null): CompareMetricRow[] {
  const rows: CompareMetricRow[] = [];
  const comparison = session.benchmarkComparison;
  if (!comparison) {
    return rows;
  }

  rows.push({
    id: "phase_sequence_status",
    label: "Phase sequence",
    benchmarkValue: "Benchmark order",
    attemptValue: comparison.phaseMatch.matched
      ? "Matched"
      : `${Math.min(comparison.phaseMatch.matchedCount, comparison.phaseMatch.expectedPhaseKeys.length)} / ${comparison.phaseMatch.expectedPhaseKeys.length} matched`,
    severity: comparison.phaseMatch.matched ? "success" : "warning",
    available: true
  });

  rows.push({
    id: "timing_status",
    label: "Timing status",
    benchmarkValue: comparison.timing.present ? "Timing target available" : "No timing target",
    attemptValue: comparison.timing.present
      ? (comparison.timing.matched ? "Within tolerance" : "Outside tolerance")
      : "Unavailable",
    severity: comparison.timing.present ? toSeverity(comparison.timing.matched ?? undefined) : "info",
    available: comparison.timing.present
  });

  if (typeof comparison.timing.expectedRepDurationMs === "number" && typeof comparison.timing.actualRepDurationMs === "number") {
    rows.push({
      id: "rep_duration_diff",
      label: "Rep duration",
      benchmarkValue: formatMs(comparison.timing.expectedRepDurationMs),
      attemptValue: formatMs(comparison.timing.actualRepDurationMs),
      differenceValue: formatDelta(comparison.timing.expectedRepDurationMs, comparison.timing.actualRepDurationMs),
      severity: toSeverity(comparison.timing.matched ?? undefined),
      available: true
    });
  }

  if (typeof comparison.timing.expectedHoldDurationMs === "number" && typeof comparison.timing.actualHoldDurationMs === "number") {
    rows.push({
      id: "hold_duration_diff",
      label: "Hold duration",
      benchmarkValue: formatMs(comparison.timing.expectedHoldDurationMs),
      attemptValue: formatMs(comparison.timing.actualHoldDurationMs),
      differenceValue: formatDelta(comparison.timing.expectedHoldDurationMs, comparison.timing.actualHoldDurationMs),
      severity: toSeverity(comparison.timing.matched ?? undefined),
      available: true
    });
  }

  comparison.timing.phaseTimingCompared.forEach((entry) => {
    rows.push({
      id: `phase_timing_${entry.phaseKey}`,
      label: `Phase timing: ${entry.phaseKey}`,
      benchmarkValue: formatMs(entry.expectedDurationMs),
      attemptValue: formatMs(entry.actualDurationMs),
      differenceValue: formatDelta(entry.expectedDurationMs, entry.actualDurationMs),
      severity: toSeverity(entry.withinTolerance),
      available: true
    });
  });

  if (typeof session.summary.repCount === "number") {
    rows.push({
      id: "completed_reps",
      label: "Completed reps",
      benchmarkValue: "—",
      attemptValue: String(session.summary.repCount),
      severity: session.summary.repCount > 0 ? "success" : "info",
      available: true
    });
  }

  const holdDurations = session.events
    .filter((event) => event.type === "hold_end")
    .map((event) => Number(event.details?.durationMs ?? event.details?.holdDurationMs))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (holdDurations.length > 0) {
    rows.push({
      id: "completed_holds",
      label: "Completed holds",
      benchmarkValue: "—",
      attemptValue: String(holdDurations.length),
      severity: "info",
      available: true
    });
    rows.push({
      id: "best_hold",
      label: "Best hold",
      benchmarkValue: "—",
      attemptValue: formatMs(Math.max(...holdDurations)),
      severity: "success",
      available: true
    });
  }

  if (typeof session.summary.confidenceAvg === "number") {
    rows.push({
      id: "confidence_avg",
      label: "Confidence",
      benchmarkValue: "—",
      attemptValue: `${Math.round(session.summary.confidenceAvg * 100)}%`,
      severity: session.summary.confidenceAvg >= 0.7 ? "success" : "info",
      available: true
    });
  }

  if (rows.length === 0 && benchmarkFeedback?.topFindings.length) {
    rows.push({
      id: "benchmark_status",
      label: "Benchmark status",
      benchmarkValue: benchmarkFeedback.summary.label,
      attemptValue: benchmarkFeedback.topFindings[0]?.title ?? benchmarkFeedback.summary.description,
      severity: benchmarkFeedback.summary.severity,
      available: true
    });
  }

  return rows;
}

function deriveFocusAreas(
  coachingFeedback?: CoachingFeedbackOutput | null,
  benchmarkFeedback?: BenchmarkCoachingFeedback | null
): string[] {
  const focus = new Set<string>();

  for (const breakdown of coachingFeedback?.bodyPartBreakdown ?? []) {
    const label = breakdown.bodyPart.trim();
    if (label) focus.add(label);
  }

  for (const issue of coachingFeedback?.improvements ?? []) {
    if (issue.category === "timing") focus.add("Timing");
    if (issue.category === "sequence") focus.add("Sequence");
    if (issue.category === "support") focus.add("Support");
    if (issue.category === "visibility") focus.add("Visibility");
    if (issue.bodyRegion === "hips" || issue.title.toLowerCase().includes("hip")) focus.add("Hips");
    if (issue.bodyRegion === "shoulders" || issue.title.toLowerCase().includes("shoulder")) focus.add("Shoulders");
  }

  for (const finding of benchmarkFeedback?.topFindings ?? []) {
    if (finding.category === "timing" || finding.category === "duration") focus.add("Timing");
    if (finding.category === "sequence") focus.add("Sequence");
    if (finding.category === "attempt_missing_data") focus.add("Visibility");
  }

  if (focus.size === 0) {
    focus.add("Timing");
  }

  return Array.from(focus).slice(0, 4);
}
