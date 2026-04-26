import type { DrillPersonalBests, SavedAttemptSummary, SavedAttemptMovementType } from "./types.ts";

function resolveMovementType(attempts: SavedAttemptSummary[]): SavedAttemptMovementType {
  const hasRep = attempts.some((attempt) => attempt.movementType === "REP");
  const hasHold = attempts.some((attempt) => attempt.movementType === "HOLD");
  if (hasRep && !hasHold) return "REP";
  if (hasHold && !hasRep) return "HOLD";
  return "unknown";
}

export function computeDrillPersonalBests(attempts: SavedAttemptSummary[]): DrillPersonalBests[] {
  const grouped = new Map<string, SavedAttemptSummary[]>();

  for (const attempt of attempts) {
    const key = attempt.drillId?.trim() || attempt.drillTitle.trim().toLowerCase();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(attempt);
  }

  return [...grouped.values()]
    .map((drillAttempts) => {
      const latest = [...drillAttempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return {
        drillId: latest?.drillId,
        drillTitle: latest?.drillTitle ?? "Unknown drill",
        movementType: resolveMovementType(drillAttempts),
        bestRepsCounted: Math.max(0, ...drillAttempts.map((attempt) => attempt.repsCounted ?? 0)),
        longestHoldSeconds: Math.max(0, ...drillAttempts.map((attempt) => attempt.longestHoldSeconds ?? 0)),
        mostRecentAttemptAt: latest?.createdAt
      } satisfies DrillPersonalBests;
    })
    .sort((a, b) => (b.mostRecentAttemptAt ?? "").localeCompare(a.mostRecentAttemptAt ?? ""));
}
