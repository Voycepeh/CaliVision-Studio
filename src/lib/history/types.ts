export type SavedAttemptSource = "upload" | "live";
export type SavedAttemptMovementType = "REP" | "HOLD" | "unknown";
export type SavedAttemptStatus = "completed" | "partial" | "failed" | "degraded";

export type SavedAttemptSummary = {
  id: string;
  createdAt: string;
  source: SavedAttemptSource;
  drillId?: string;
  drillVersion?: string;
  drillTitle: string;
  movementType: SavedAttemptMovementType;
  durationSeconds?: number;
  repsCounted?: number;
  repsIncomplete?: number;
  longestHoldSeconds?: number;
  totalHoldSeconds?: number;
  commonFailureReason?: string;
  mainFinding?: string;
  status: SavedAttemptStatus;
  analysisModelVersion: string;
};

export type DrillPersonalBests = {
  drillId?: string;
  drillTitle: string;
  bestRepsCounted: number;
  longestHoldSeconds: number;
  mostRecentAttemptAt?: string;
};
