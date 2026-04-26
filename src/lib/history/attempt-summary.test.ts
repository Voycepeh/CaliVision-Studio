import test from "node:test";
import assert from "node:assert/strict";
import type { AnalysisReviewModel } from "../analysis-viewer/review-model.ts";
import { buildSavedAttemptSummary } from "./attempt-summary.ts";

function baseReview(overrides: Partial<AnalysisReviewModel>): AnalysisReviewModel {
  return {
    source: "upload",
    drillLabel: "Demo drill",
    movementType: "REP",
    totalAnalyzedDurationMs: 12_000,
    statusLabel: "Review ready",
    summaryLabel: "summary",
    repEvents: [],
    holdEvents: [],
    phaseEvents: [],
    diagnostics: [],
    ...overrides
  };
}

test("buildSavedAttemptSummary maps REP review into compact attempt summary", () => {
  const summary = buildSavedAttemptSummary({
    review: baseReview({
      movementType: "REP",
      repEvents: [
        { id: "rep_1", index: 1, startMs: 0, endMs: 4_000, durationMs: 4_000, status: "counted", phaseSequence: ["down", "up"] }
      ]
    }),
    source: "upload",
    drillId: "drill_pushup",
    drillVersion: "v2",
    createdAt: "2026-04-26T10:00:00.000Z"
  });

  assert.equal(summary.source, "upload");
  assert.equal(summary.drillId, "drill_pushup");
  assert.equal(summary.repsCounted, 1);
  assert.equal(summary.movementType, "REP");
  assert.equal(summary.status, "completed");
});

test("buildSavedAttemptSummary maps HOLD review into compact attempt summary", () => {
  const summary = buildSavedAttemptSummary({
    review: baseReview({
      source: "live",
      movementType: "HOLD",
      holdEvents: [
        { id: "hold_1", index: 1, startMs: 2_000, endMs: 8_000, durationMs: 6_000, targetStatus: "Ended: target reached" }
      ]
    }),
    source: "live",
    drillId: "drill_plank",
    createdAt: "2026-04-26T11:00:00.000Z"
  });

  assert.equal(summary.source, "live");
  assert.equal(summary.movementType, "HOLD");
  assert.equal(summary.longestHoldSeconds, 6);
  assert.equal(summary.totalHoldSeconds, 6);
  assert.equal(summary.status, "completed");
});
