import test from "node:test";
import assert from "node:assert/strict";
import { computeDrillPersonalBests } from "./personal-bests.ts";
import type { SavedAttemptSummary } from "./types.ts";

const attempts: SavedAttemptSummary[] = [
  {
    id: "a1",
    createdAt: "2026-04-24T10:00:00.000Z",
    source: "upload",
    drillId: "drill_pushup",
    drillTitle: "Push-up",
    movementType: "REP",
    repsCounted: 8,
    status: "completed",
    analysisModelVersion: "analysis-review-v1"
  },
  {
    id: "a2",
    createdAt: "2026-04-25T10:00:00.000Z",
    source: "live",
    drillId: "drill_pushup",
    drillTitle: "Push-up",
    movementType: "REP",
    repsCounted: 10,
    status: "completed",
    analysisModelVersion: "analysis-review-v1"
  },
  {
    id: "a3",
    createdAt: "2026-04-26T10:00:00.000Z",
    source: "live",
    drillId: "drill_plank",
    drillTitle: "Plank",
    movementType: "HOLD",
    longestHoldSeconds: 42,
    status: "completed",
    analysisModelVersion: "analysis-review-v1"
  }
];

test("computeDrillPersonalBests returns best reps, best hold, and latest per drill", () => {
  const personalBests = computeDrillPersonalBests(attempts);

  const pushup = personalBests.find((item) => item.drillId === "drill_pushup");
  const plank = personalBests.find((item) => item.drillId === "drill_plank");

  assert.equal(pushup?.bestRepsCounted, 10);
  assert.equal(pushup?.mostRecentAttemptAt, "2026-04-25T10:00:00.000Z");
  assert.equal(plank?.longestHoldSeconds, 42);
});
