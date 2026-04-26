import assert from "node:assert/strict";
import test from "node:test";
import { formatAttemptKeyMetric } from "./attempt-metrics.ts";

test("formatAttemptKeyMetric renders REP attempts as reps", () => {
  assert.equal(formatAttemptKeyMetric({ movementType: "REP", repsCounted: 12 }), "12 reps");
});

test("formatAttemptKeyMetric renders HOLD attempts as longest hold", () => {
  assert.equal(formatAttemptKeyMetric({ movementType: "HOLD", longestHoldSeconds: 15.2 }), "15s longest hold");
});

test("formatAttemptKeyMetric renders unknown attempts with duration when present", () => {
  assert.equal(formatAttemptKeyMetric({ movementType: "unknown", durationSeconds: 8.6 }), "9s analyzed");
});

test("formatAttemptKeyMetric renders unknown attempts without duration fallback", () => {
  assert.equal(formatAttemptKeyMetric({ movementType: "unknown" }), "No primary metric captured");
});
