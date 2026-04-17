import test from "node:test";
import assert from "node:assert/strict";
import { mapUploadAnalysisToViewerModel, mapLiveAnalysisToViewerModel } from "./adapters.ts";

const panel = {
  drillLabel: "Demo drill",
  movementTypeLabel: "REP drill",
  primaryMetricLabel: "Rep count",
  primaryMetricValue: "4",
  currentPhaseLabel: "1. Setup",
  confidenceLabel: "82%",
  feedbackLines: ["Coach notes not available yet", "Run another analysis for more guidance."],
  summaryMetrics: [],
  phaseTimelineSegments: []
};

test("mapUploadAnalysisToViewerModel maps session events to timeline", () => {
  const model = mapUploadAnalysisToViewerModel({
    previewState: "showing_annotated_completed",
    videoUrl: "blob://demo",
    canShowVideo: true,
    surface: "annotated",
    hasRaw: true,
    hasAnnotated: true,
    primarySummaryChips: [],
    downloads: [],
    diagnosticsSections: [],
    panel,
    mediaAspectRatio: 9 / 16,
    session: {
      sessionId: "s1",
      drillId: "d1",
      status: "completed",
      startedAtIso: "",
      completedAtIso: "",
      frameSamples: [],
      events: [{ eventId: "e1", type: "rep_complete", timestampMs: 1200 }],
      summary: { analyzedDurationMs: 2000 }
    } as never
  });

  assert.equal(model.state, "ready");
  assert.equal(model.surface, "annotated");
  assert.equal(model.timelineEvents[0]?.id, "e1");
  assert.equal(model.mediaAspectRatio, 9 / 16);
  assert.equal(model.surfaces.find((surface) => surface.id === "annotated")?.availability, "ready");
});

test("mapUploadAnalysisToViewerModel surfaces formatted annotated render progress", () => {
  const model = mapUploadAnalysisToViewerModel({
    previewState: "processing_annotated",
    videoUrl: null,
    canShowVideo: false,
    surface: "raw",
    hasRaw: true,
    hasAnnotated: false,
    primarySummaryChips: [],
    technicalStatusChips: [],
    downloads: [],
    diagnosticsSections: [],
    panel,
    session: null,
    processingStageLabel: "Rendering frames 172/642",
    replayStateLabel: "Exporting annotated replay… · Rendering annotated video… 172/642 frames",
    replayTone: "warning"
  });

  assert.equal(model.state, "loading");
  assert.equal(model.stateDetail, "Rendering annotated video… 172/642 frames");
  assert.ok(model.technicalStatusChips.some((chip) => chip.id === "replay_state" && chip.tone === "warning"));
});

test("mapUploadAnalysisToViewerModel keeps both surfaces ready after completed upload when annotated is preferred", () => {
  const model = mapUploadAnalysisToViewerModel({
    previewState: "showing_annotated_completed",
    videoUrl: "blob://annotated",
    canShowVideo: true,
    surface: "annotated",
    hasRaw: true,
    hasAnnotated: true,
    primarySummaryChips: [],
    downloads: [],
    diagnosticsSections: [],
    panel,
    session: null
  });

  assert.equal(model.surfaces.find((surface) => surface.id === "annotated")?.availability, "ready");
  assert.equal(model.surfaces.find((surface) => surface.id === "raw")?.availability, "ready");
});

test("mapUploadAnalysisToViewerModel marks annotated unavailable when only raw upload media exists", () => {
  const model = mapUploadAnalysisToViewerModel({
    previewState: "showing_raw_completed",
    videoUrl: "blob://raw",
    canShowVideo: true,
    surface: "raw",
    hasRaw: true,
    hasAnnotated: false,
    primarySummaryChips: [],
    downloads: [],
    diagnosticsSections: [],
    panel,
    session: null
  });

  assert.equal(model.surfaces.find((surface) => surface.id === "annotated")?.availability, "unavailable");
  assert.equal(model.surfaces.find((surface) => surface.id === "raw")?.availability, "ready");
});

test("mapUploadAnalysisToViewerModel preserves processing UX when annotated render is still in progress", () => {
  const defaultProcessing = mapUploadAnalysisToViewerModel({
    previewState: "processing_annotated",
    videoUrl: null,
    canShowVideo: false,
    surface: "annotated",
    hasRaw: true,
    hasAnnotated: false,
    primarySummaryChips: [],
    downloads: [],
    diagnosticsSections: [],
    panel,
    session: null
  });

  assert.equal(defaultProcessing.surfaces.find((surface) => surface.id === "annotated")?.availability, "processing");
  assert.equal(defaultProcessing.surfaces.find((surface) => surface.id === "raw")?.availability, "unavailable");

  const rawRequestedDuringProcessing = mapUploadAnalysisToViewerModel({
    previewState: "showing_raw_during_processing",
    videoUrl: "blob://raw",
    canShowVideo: true,
    surface: "raw",
    hasRaw: true,
    hasAnnotated: false,
    primarySummaryChips: [],
    downloads: [],
    diagnosticsSections: [],
    panel,
    session: null
  });

  assert.equal(rawRequestedDuringProcessing.surfaces.find((surface) => surface.id === "annotated")?.availability, "processing");
  assert.equal(rawRequestedDuringProcessing.surfaces.find((surface) => surface.id === "raw")?.availability, "ready");
});

test("mapLiveAnalysisToViewerModel includes replay chip and loading state", () => {
  const model = mapLiveAnalysisToViewerModel({
    replayState: "export-in-progress",
    replayStageLabel: "Rendering",
    videoUrl: null,
    surface: "annotated",
    primarySummaryChips: [],
    downloads: [],
    diagnosticsSections: [],
    panel,
    markers: [],
    durationMs: 1000,
    hasAnnotatedReady: false,
    mediaAspectRatio: 16 / 9
  });

  assert.equal(model.state, "loading");
  assert.equal(model.surface, "annotated");
  assert.equal(model.canShowVideo, false);
  assert.ok(model.technicalStatusChips.some((chip) => chip.id === "replay_state"));
  assert.equal(model.mediaAspectRatio, 16 / 9);
  assert.equal(model.surfaces.find((surface) => surface.id === "annotated")?.availability, "processing");
  assert.equal(model.surfaces.find((surface) => surface.id === "raw")?.availability, "processing");
});
