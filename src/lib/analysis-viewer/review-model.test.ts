import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalysisReviewModel, formatAnalysisReviewTime } from "./review-model.ts";
import type { AnalysisViewerModel } from "./types.ts";

function createBaseModel(movementTypeLabel: string): AnalysisViewerModel {
  return {
    state: "ready",
    videoUrl: "blob://video",
    canShowVideo: true,
    surface: "annotated",
    surfaces: [],
    timelineDurationMs: 12_400,
    timelineEvents: [],
    primarySummaryChips: [],
    technicalStatusChips: [],
    downloads: [],
    diagnosticsSections: [{ id: "phase", title: "Phase trace", content: ["phase_enter"] }],
    panel: {
      drillLabel: "Demo Drill",
      movementTypeLabel,
      primaryMetricLabel: "Rep count",
      primaryMetricValue: "1",
      currentPhaseLabel: "1. Setup",
      confidenceLabel: "90%",
      feedbackLines: ["Keep hips stable."],
      summaryMetrics: [],
      phaseTimelineSegments: []
    },
    warnings: []
  };
}

test("buildAnalysisReviewModel maps REP events", () => {
  const model = createBaseModel("REP drill");
  model.timelineEvents = [{ id: "rep_1", timestampMs: 2200, label: "2.2s rep", kind: "rep", seekable: true }];
  model.panel.phaseTimelineSegments = [
    { id: "p1", label: "Setup", startMs: 200, endMs: 1000, seekTimestampMs: 200, interactive: true },
    { id: "p2", label: "Drive", startMs: 1200, endMs: 2100, seekTimestampMs: 1200, interactive: true }
  ];

  const review = buildAnalysisReviewModel(model, "upload");
  assert.equal(review.movementType, "REP");
  assert.equal(review.repEvents.length, 1);
  assert.equal(review.repEvents[0]?.status, "counted");
});

test("buildAnalysisReviewModel maps HOLD events", () => {
  const model = createBaseModel("HOLD drill");
  model.timelineEvents = [
    { id: "h1", timestampMs: 1500, label: "hold start", kind: "hold", eventType: "hold_start", seekable: true },
    { id: "h2", timestampMs: 4200, label: "hold end", kind: "hold", eventType: "hold_end", exitReason: "target_reached", seekable: true }
  ];

  const review = buildAnalysisReviewModel(model, "live");
  assert.equal(review.movementType, "HOLD");
  assert.equal(review.holdEvents.length, 1);
  assert.equal(review.holdEvents[0]?.durationMs, 2700);
});

test("buildAnalysisReviewModel handles empty result state", () => {
  const model = createBaseModel("REP drill");
  const review = buildAnalysisReviewModel(model, "upload");
  assert.equal(review.repEvents.length, 0);
  assert.equal(review.summaryLabel, "No reps detected");
});

test("formatAnalysisReviewTime uses seconds formatting", () => {
  assert.equal(formatAnalysisReviewTime(800), "0.8s");
  assert.equal(formatAnalysisReviewTime(12_400), "12.4s");
  assert.equal(formatAnalysisReviewTime(63_200), "1:03.2");
});
