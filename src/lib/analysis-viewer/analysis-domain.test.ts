import test from "node:test";
import assert from "node:assert/strict";

import { buildAnalysisDomainModel, buildAnalysisPanelModel } from "./analysis-domain.ts";

test("buildAnalysisDomainModel resolves timestamp mode phase for upload replay", () => {
  const model = buildAnalysisDomainModel({
    drillLabel: "Hip opener",
    movementType: "rep",
    repCount: 5,
    durationMs: 8000,
    mode: "timestamp",
    currentTimestampMs: 2500,
    phaseLabelsById: { p1: "1. Setup", p2: "2. Drive" },
    phaseIdsInOrder: ["p1", "p2"],
    events: [
      { eventId: "e1", type: "phase_enter", timestampMs: 0, phaseId: "p1" },
      { eventId: "e2", type: "phase_enter", timestampMs: 2000, phaseId: "p2" }
    ],
    phaseTimelineInteractive: true
  });

  assert.equal(model.sessionSnapshot.mode, "timestamp");
  assert.equal(model.sessionSnapshot.currentTimestampMs, 2500);
  assert.equal(model.sessionSnapshot.currentPhaseLabel, "2. Drive");
});

test("buildAnalysisDomainModel resolves latest mode phase for live sessions", () => {
  const model = buildAnalysisDomainModel({
    drillLabel: "Wall hold",
    movementType: "hold",
    holdDurationMs: 4100,
    mode: "latest",
    phaseLabelsById: { p1: "1. Setup", p2: "2. Hold" },
    phaseIdsInOrder: ["p1", "p2"],
    events: [
      { eventId: "e1", type: "phase_enter", timestampMs: 0, phaseId: "p1" },
      { eventId: "e2", type: "phase_enter", timestampMs: 3000, phaseId: "p2" }
    ],
    phaseTimelineInteractive: false
  });

  assert.equal(model.sessionSnapshot.mode, "latest");
  assert.equal(model.sessionSnapshot.currentTimestampMs, undefined);
  assert.equal(model.sessionSnapshot.currentPhaseLabel, "2. Hold");
});

test("buildAnalysisDomainModel falls back phase labels when phase data is incomplete", () => {
  const model = buildAnalysisDomainModel({
    drillLabel: "Freestyle",
    movementType: "freestyle",
    events: [{ eventId: "e1", type: "phase_enter", timestampMs: 0, phaseId: "unknown" }],
    phaseLabelsById: {},
    phaseIdsInOrder: [],
    phaseTimelineInteractive: false
  });

  assert.equal(model.sessionSnapshot.currentPhaseLabel, "Phase unavailable");
  assert.equal(model.sessionSnapshot.phaseTimelineSegments.length, 1);
  assert.equal(model.sessionSnapshot.phaseTimelineSegments[0]?.label, "Phase timeline unavailable");
});

test("buildAnalysisDomainModel builds reusable timeline segments with identifiers", () => {
  const model = buildAnalysisDomainModel({
    drillLabel: "Lunge",
    movementType: "rep",
    durationMs: 6000,
    phaseLabelsById: { p1: "1. Lower", p2: "2. Rise" },
    phaseIdsInOrder: ["p1", "p2"],
    events: [
      { eventId: "e1", type: "phase_enter", timestampMs: 500, phaseId: "p1" },
      { eventId: "e2", type: "phase_enter", timestampMs: 3000, phaseId: "p2" }
    ],
    phaseTimelineInteractive: true
  });

  const [first, second] = model.sessionSnapshot.phaseTimelineSegments;
  assert.equal(first?.phaseId, "p1");
  assert.equal(first?.orderIndex, 0);
  assert.equal(first?.startMs, 500);
  assert.equal(first?.seekTimestampMs, 500);
  assert.equal(second?.phaseId, "p2");
  assert.equal(second?.orderIndex, 1);
  assert.equal(second?.startMs, 3000);
  assert.equal(second?.interactive, true);
});

test("buildAnalysisPanelModel shapes domain model for analysis panel presentation", () => {
  const domainModel = buildAnalysisDomainModel({
    drillLabel: "Wall hold",
    movementType: "hold",
    holdDurationMs: 3456,
    confidence: 0.82,
    feedbackLines: ["Stay tall", "Brace your core", "extra line ignored"],
    phaseLabelsById: { p1: "1. Hold" },
    phaseIdsInOrder: ["p1"],
    events: [{ eventId: "e1", type: "phase_enter", timestampMs: 0, phaseId: "p1" }],
    phaseTimelineInteractive: false
  });

  const panel = buildAnalysisPanelModel(domainModel);
  assert.equal(panel.drillLabel, "Wall hold");
  assert.equal(panel.movementTypeLabel, "HOLD drill");
  assert.equal(panel.confidenceLabel, "82%");
  assert.equal(panel.feedbackLines.length, 2);
  assert.equal(panel.feedbackLines[0], "Stay tall");
  assert.equal(panel.phaseTimelineSegments[0]?.phaseId, "p1");
});
