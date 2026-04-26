import type { SavedAttemptSummary } from "./types.ts";

export function formatSecondsRounded(value?: number): string {
  return `${Math.round(value ?? 0)}s`;
}

export function formatAttemptKeyMetric(attempt: Pick<SavedAttemptSummary, "movementType" | "repsCounted" | "longestHoldSeconds" | "durationSeconds">): string {
  if (attempt.movementType === "REP") {
    return `${attempt.repsCounted ?? 0} reps`;
  }

  if (attempt.movementType === "HOLD") {
    return `${formatSecondsRounded(attempt.longestHoldSeconds)} longest hold`;
  }

  if (attempt.durationSeconds !== undefined) {
    return `${formatSecondsRounded(attempt.durationSeconds)} analyzed`;
  }

  return "No primary metric captured";
}
