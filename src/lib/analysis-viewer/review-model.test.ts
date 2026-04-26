import test from "node:test";
import assert from "node:assert/strict";
import { buildAnalysisReviewModel, formatAnalysisReviewTime, resolveAnalysisReviewMovementType } from "./review-model.ts";
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

test("buildAnalysisReviewModel pairs multiple hold starts and ends sequentially", () => {
  const model = createBaseModel("HOLD drill");
  model.timelineEvents = [
    { id: "h1s", timestampMs: 1000, label: "hold start 1", kind: "hold", eventType: "hold_start", seekable: true },
    { id: "h2s", timestampMs: 3000, label: "hold start 2", kind: "hold", eventType: "hold_start", seekable: true },
    { id: "h1e", timestampMs: 2000, label: "hold end 1", kind: "hold", eventType: "hold_end", seekable: true },
    { id: "h2e", timestampMs: 5000, label: "hold end 2", kind: "hold", eventType: "hold_end", seekable: true }
  ];

  const review = buildAnalysisReviewModel(model, "live");
  assert.equal(review.holdEvents.length, 2);
  assert.equal(review.holdEvents[0]?.endMs, 2000);
  assert.equal(review.holdEvents[1]?.endMs, 5000);
});

test("buildAnalysisReviewModel handles empty result state", () => {
  const model = createBaseModel("REP drill");
  const review = buildAnalysisReviewModel(model, "upload");
  assert.equal(review.repEvents.length, 0);
  assert.equal(review.summaryLabel, "No reps detected");
});

test("unknown/freestyle movement does not show misleading no-reps summary", () => {
  const model = createBaseModel("Freestyle");
  const review = buildAnalysisReviewModel(model, "upload");
  assert.equal(review.movementType, "unknown");
  assert.notEqual(review.summaryLabel, "No reps detected");
});

test("review summary counted reps agrees with structured rep event count", () => {
  const model = createBaseModel("REP drill");
  model.timelineEvents = [
    { id: "rep_1", timestampMs: 2000, label: "rep1", kind: "rep", seekable: true },
    { id: "rep_2", timestampMs: 4200, label: "rep2", kind: "rep", seekable: true }
  ];
  model.panel.phaseTimelineSegments = [
    { id: "p1", label: "Setup", startMs: 100, endMs: 1200, seekTimestampMs: 100, interactive: true },
    { id: "p2", label: "Drive", startMs: 1300, endMs: 2100, seekTimestampMs: 1300, interactive: true },
    { id: "p3", label: "Setup", startMs: 2200, endMs: 3200, seekTimestampMs: 2200, interactive: true },
    { id: "p4", label: "Drive", startMs: 3300, endMs: 4200, seekTimestampMs: 3300, interactive: true }
  ];
  const review = buildAnalysisReviewModel(model, "upload");
  assert.equal(review.summaryLabel, "2 counted");
  assert.equal(review.repEvents.filter((rep) => rep.status === "counted").length, 2);
});

test("resolveAnalysisReviewMovementType supports explicit and label fallback", () => {
  assert.equal(resolveAnalysisReviewMovementType({ explicitMovementType: "rep" }), "REP");
  assert.equal(resolveAnalysisReviewMovementType({ movementTypeLabel: "HOLD drill" }), "HOLD");
  assert.equal(resolveAnalysisReviewMovementType({ movementTypeLabel: "Freestyle" }), "unknown");
});

test("formatAnalysisReviewTime uses seconds formatting", () => {
  assert.equal(formatAnalysisReviewTime(800), "0.8s");
  assert.equal(formatAnalysisReviewTime(12_400), "12.4s");
  assert.equal(formatAnalysisReviewTime(63_200), "1:03.2");
});
