import test from "node:test";
import assert from "node:assert/strict";
import { mapUploadAnalysisToViewerModel, mapLiveAnalysisToViewerModel } from "./adapters.ts";

test("mapUploadAnalysisToViewerModel maps session events to timeline", () => {
  const model = mapUploadAnalysisToViewerModel({
    previewState: "showing_annotated_completed",
    videoUrl: "blob://demo",
    canShowVideo: true,
    surface: "annotated",
    selectedEventId: null,
    primarySummaryChips: [],
    downloads: [],
    diagnosticsSections: [],
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

test("mapLiveAnalysisToViewerModel includes replay chip and loading state", () => {
  const model = mapLiveAnalysisToViewerModel({
    replayState: "export-in-progress",
    replayStageLabel: "Rendering",
    videoUrl: null,
    surface: "annotated",
    selectedEventId: null,
    primarySummaryChips: [],
    downloads: [],
    diagnosticsSections: [],
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
