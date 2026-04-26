import type { AnalysisReviewModel } from "../analysis-viewer/review-model.ts";
import type { SavedAttemptSource, SavedAttemptStatus, SavedAttemptSummary } from "./types.ts";

type BuildSavedAttemptInput = {
  review: AnalysisReviewModel;
  source: SavedAttemptSource;
  drillId?: string;
  drillVersion?: string;
  createdAt?: string;
  analysisModelVersion?: string;
};

function resolveStatus(review: AnalysisReviewModel): SavedAttemptStatus {
  const hasRepFailures = review.repEvents.some((rep) => rep.status === "failed" || rep.status === "incomplete" || rep.status === "uncertain");
  const hasAnySuccess = review.movementType === "REP"
    ? review.repEvents.some((rep) => rep.status === "counted")
    : review.movementType === "HOLD"
    ? review.holdEvents.length > 0
    : Boolean(review.phaseEvents.length > 0);

  if (hasAnySuccess && hasRepFailures) return "partial";
  if (!hasAnySuccess && hasRepFailures) return "failed";
  if (review.movementType === "unknown") return "degraded";
  return hasAnySuccess ? "completed" : "degraded";
}

function resolveCommonFailureReason(review: AnalysisReviewModel): string | undefined {
  const reasons = review.repEvents
    .map((rep) => rep.failureReason?.trim())
    .filter((reason): reason is string => Boolean(reason));
  if (reasons.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function createAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `attempt_${crypto.randomUUID()}`;
  }
  return `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildSavedAttemptSummary(input: BuildSavedAttemptInput): SavedAttemptSummary {
  const { review } = input;
  const repsCounted = review.repEvents.filter((rep) => rep.status === "counted").length;
  const repsIncomplete = review.repEvents.filter((rep) => rep.status !== "counted").length;
  const holdDurationsSeconds = review.holdEvents.map((hold) => Math.max(0, hold.durationMs) / 1000);

  return {
    id: createAttemptId(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    source: input.source,
    drillId: input.drillId,
    drillVersion: input.drillVersion,
    drillTitle: review.drillLabel,
    movementType: review.movementType,
    durationSeconds: Math.max(0, review.totalAnalyzedDurationMs) / 1000,
    repsCounted: review.movementType === "REP" ? repsCounted : undefined,
    repsIncomplete: review.movementType === "REP" ? repsIncomplete : undefined,
    longestHoldSeconds: holdDurationsSeconds.length > 0 ? Math.max(...holdDurationsSeconds) : undefined,
    totalHoldSeconds: holdDurationsSeconds.length > 0 ? holdDurationsSeconds.reduce((sum, seconds) => sum + seconds, 0) : undefined,
    commonFailureReason: resolveCommonFailureReason(review),
    mainFinding: review.mainCoachingFinding,
    status: resolveStatus(review),
    analysisModelVersion: input.analysisModelVersion ?? "analysis-review-v1"
  };
}
