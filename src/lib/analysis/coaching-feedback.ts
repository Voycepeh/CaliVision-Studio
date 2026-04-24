import type { CanonicalJointName, PortableDrill } from "../schema/contracts.ts";
import type { PoseFrame } from "../upload/types.ts";
import type { AnalysisSessionRecord } from "./session-repository.ts";
import type { BenchmarkCoachingFeedback } from "./benchmark-feedback.ts";
import type { ReplayAnalysisState } from "./replay-analysis-state.ts";
import { resolveDrillSpecificCoaching } from "./coaching-rules.ts";

export type CoachingIssue = {
  id: string;
  title: string;
  description: string;
  severity: "success" | "info" | "warning";
  category: "alignment" | "stability" | "timing" | "sequence" | "support" | "visibility" | "benchmark";
  bodyRegion?: "shoulders" | "ribs" | "pelvis" | "hips" | "legs" | "feet" | "head" | "full_body";
  cueText: string;
  audioCue?: string;
  visualGuides: CoachingVisualGuide[];
};

export type CoachingVisualGuide = {
  type: "stack_line" | "ghost_pose" | "highlight_region" | "correction_arrow" | "support_indicator" | "metric_badge";
  targetJoints?: CanonicalJointName[];
  fromJoint?: CanonicalJointName;
  toJoint?: CanonicalJointName;
  direction?: "up" | "down" | "left" | "right" | "toward_line" | "inward" | "outward";
  label?: string;
  severity?: "success" | "info" | "warning";
};

export type CoachingBodyPartFinding = {
  bodyPart: string;
  observation: string;
  correction: string;
  visualGuides: CoachingVisualGuide[];
};

export type CoachingMentalModel = {
  avoidThinking?: string;
  thinkInstead: string;
  explanation?: string;
};

export type CoachingFixStep = {
  order: number;
  title: string;
  instruction: string;
  cueText: string;
  visualGuides: CoachingVisualGuide[];
};

export type CoachingFeedbackOutput = {
  summaryLabel: string;
  summaryDescription: string;
  positives: CoachingIssue[];
  primaryIssue?: CoachingIssue;
  improvements: CoachingIssue[];
  bodyPartBreakdown: CoachingBodyPartFinding[];
  mentalModel?: CoachingMentalModel;
  orderedFixSteps: CoachingFixStep[];
  nextSteps: string[];
  visualGuides: CoachingVisualGuide[];
};

function toIssue(finding: BenchmarkCoachingFeedback["findings"][number], index: number): CoachingIssue {
  const severity = finding.severity;
  const isSuccess = severity === "success";
  const category: CoachingIssue["category"] = finding.category === "sequence" ? "sequence"
    : finding.category === "timing" || finding.category === "duration" ? "timing"
      : finding.category === "benchmark_missing" ? "benchmark"
        : "visibility";
  return {
    id: `benchmark_${finding.category}_${index}`,
    title: finding.title,
    description: finding.description,
    severity,
    category,
    cueText: finding.recommendedAction ?? (isSuccess ? "Keep this quality on the next set." : "Stay controlled and retest."),
    visualGuides: [{ type: "metric_badge", label: finding.title, severity }]
  };
}

function derivePositivesFromSession(input: {
  session?: AnalysisSessionRecord | null;
  replayState?: ReplayAnalysisState;
  drill?: PortableDrill | null;
}): CoachingIssue[] {
  const positives: CoachingIssue[] = [];
  const isHold = input.drill?.drillType === "hold" || input.session?.drillMeasurementType === "hold";
  if (isHold) {
    if ((input.replayState?.holdCount ?? 0) > 0 || (input.replayState?.maxHoldMs ?? 0) > 0) {
      positives.push({
        id: "hold_completed",
        title: "Completed hold detected",
        description: "You completed at least one hold segment in this attempt.",
        severity: "success",
        category: "stability",
        bodyRegion: "full_body",
        cueText: "Keep this hold control while refining line.",
        visualGuides: [{ type: "metric_badge", label: "Hold completed", severity: "success" }]
      });
    }
  } else if ((input.replayState?.repCount ?? 0) > 0) {
    positives.push({
      id: "rep_completed",
      title: "Completed reps detected",
      description: `Completed ${input.replayState?.repCount ?? 0} reps in this attempt.`,
      severity: "success",
      category: "sequence",
      bodyRegion: "full_body",
      cueText: "Keep that rep rhythm while tightening form.",
      visualGuides: [{ type: "metric_badge", label: "Reps completed", severity: "success" }]
    });
  }
  return positives;
}

export function buildVisualCoachingFeedback(input: {
  session?: AnalysisSessionRecord | null;
  benchmarkFeedback?: BenchmarkCoachingFeedback | null;
  drill?: PortableDrill | null;
  replayState?: ReplayAnalysisState;
  frame?: PoseFrame;
  timestampMs?: number;
}): CoachingFeedbackOutput {
  const benchmarkIssues = (input.benchmarkFeedback?.findings ?? []).map(toIssue);
  const positives = [...benchmarkIssues.filter((issue) => issue.severity === "success"), ...derivePositivesFromSession(input)];
  const improvements = benchmarkIssues.filter((issue) => issue.severity !== "success");

  const ruleOutput = resolveDrillSpecificCoaching({
    drill: input.drill,
    frame: input.frame,
    replayState: input.replayState
  });

  const mergedPositives = [...positives, ...(ruleOutput.positives ?? [])];
  const mergedImprovements = [...improvements, ...(ruleOutput.improvements ?? [])];
  const primaryIssue = ruleOutput.primaryIssue ?? mergedImprovements[0];

  return {
    summaryLabel: input.benchmarkFeedback?.summary.label ?? "Coaching ready",
    summaryDescription: input.benchmarkFeedback?.summary.description ?? "No benchmark available. Add benchmark timing/phase targets for deeper coaching.",
    positives: mergedPositives,
    primaryIssue,
    improvements: mergedImprovements,
    bodyPartBreakdown: ruleOutput.bodyPartBreakdown ?? [],
    mentalModel: ruleOutput.mentalModel,
    orderedFixSteps: ruleOutput.orderedFixSteps ?? [],
    nextSteps: input.benchmarkFeedback?.nextSteps?.length ? input.benchmarkFeedback.nextSteps : ["Run another attempt and keep full body in frame."],
    visualGuides: primaryIssue?.visualGuides ?? ruleOutput.visualGuides ?? []
  };
}
