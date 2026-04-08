import test from "node:test";
import assert from "node:assert/strict";
import {
  findLatestSessionForUpload,
  getLifecycleLabel,
  getSessionOutcomeLabel,
  getUploadLifecycleState,
  hasMeaningfulAnalysisOutput,
  hasPlayableMediaSource,
  isReviewableSession,
  summarizeSessionAvailability
} from "./analysis-session-ux.ts";
import type { AnalysisSessionRecord } from "../analysis/session-repository.ts";
import type { UploadJob } from "./types.ts";

function buildUploadJob(overrides: Partial<UploadJob> = {}): UploadJob {
  return {
    id: "job-1",
    mediaSource: {
      sourceType: "file",
      sourceLabel: "Uploaded file"
    },
    file: new File(["video"], "attempt.mp4", { type: "video/mp4" }),
    fileName: "attempt.mp4",
    fileSizeBytes: 1024,
    status: "queued",
    stageLabel: "Ready",
    progress: 0,
    createdAtIso: "2026-04-08T00:00:00.000Z",
    drillSelection: {
      drill: {
        drillId: "drill-1",
        slug: "drill-1",
        title: "Drill 1",
        drillType: "rep",
        difficulty: "beginner",
        tags: [],
        defaultView: "side",
        phases: []
      },
      drillVersion: "sample-v1",
      drillBinding: {
        drillId: "drill-1",
        drillName: "Drill 1",
        drillVersion: "sample-v1",
        sourceKind: "seeded"
      }
    },
    ...overrides
  };
}

function buildSession(overrides: Partial<AnalysisSessionRecord> = {}): AnalysisSessionRecord {
  return {
    sessionId: "session-1",
    drillId: "drill-1",
    sourceKind: "upload",
    status: "completed",
    createdAtIso: "2026-04-08T00:00:00.000Z",
    summary: { repCount: 2, analyzedDurationMs: 1200 },
    frameSamples: [{ timestampMs: 0, classifiedPhaseId: "start", confidence: 0.88 }],
    events: [{ eventId: "e-1", type: "phase_enter", timestampMs: 0, phaseId: "start" }],
    ...overrides
  };
}

test("upload success path surfaces results entry point state", () => {
  const state = getUploadLifecycleState(buildUploadJob({ status: "completed" }), true);
  assert.equal(state, "results_available");
  assert.equal(getLifecycleLabel(state), "Results available");
});

test("failed upload analysis is represented truthfully", () => {
  const state = getUploadLifecycleState(buildUploadJob({ status: "failed" }), false);
  assert.equal(state, "analysis_failed");
  assert.equal(getLifecycleLabel(state), "Analysis failed");
});

test("recent analyses remain usable through source-linked lookup", () => {
  const sessions = [
    buildSession({ sessionId: "older", sourceId: "upload-2", createdAtIso: "2026-04-08T00:00:00.000Z" }),
    buildSession({ sessionId: "newest", sourceId: "upload-1", createdAtIso: "2026-04-08T01:00:00.000Z" })
  ];

  const linked = findLatestSessionForUpload(sessions, "upload-1");
  assert.equal(linked?.sessionId, "newest");
});

test("session detail labels missing source media or structured analysis clearly", () => {
  const missingMedia = getSessionOutcomeLabel(buildSession({ rawVideoUri: undefined }));
  assert.equal(missingMedia, "Structured analysis available, source media URI missing");

  const missingStructured = summarizeSessionAvailability(buildSession({ frameSamples: [], events: [] }));
  assert.deepEqual(missingStructured, ["Source media URI missing", "Structured frame samples unavailable", "Event log unavailable"]);
});

test("debug-oriented partial outcomes are called out", () => {
  const label = getSessionOutcomeLabel(buildSession({ status: "partial", frameSamples: [], events: [] }));
  assert.equal(label, "Partial analysis");
});

test("no-event sessions surface explicit known cause messaging", () => {
  const label = getSessionOutcomeLabel(
    buildSession({
      events: [],
      debug: { noEventCause: "no_confirmed_phase_transitions" }
    })
  );
  assert.equal(label, "Structured frames available, no confirmed phase transitions");

  const notes = summarizeSessionAvailability(
    buildSession({
      events: [],
      rawVideoUri: "upload://local/attempt.mp4",
      debug: {
        noEventCause: "low_confidence_frames",
        noEventDetails: ["All sampled frames were below the classification confidence threshold."]
      }
    })
  );
  assert.deepEqual(notes, [
    "Event log unavailable",
    "Cause: low_confidence_frames",
    "All sampled frames were below the classification confidence threshold."
  ]);
});

test("reviewable session detection accepts playable media sessions", () => {
  const session = buildSession({
    frameSamples: [],
    events: [],
    summary: { repCount: 0, analyzedDurationMs: 0 },
    rawVideoUri: "upload://local/attempt.mp4"
  });
  assert.equal(hasPlayableMediaSource(session), true);
  assert.equal(hasMeaningfulAnalysisOutput(session), false);
  assert.equal(isReviewableSession(session), true);
});

test("reviewable session detection accepts meaningful analysis without media uri", () => {
  const session = buildSession({
    rawVideoUri: undefined,
    frameSamples: [],
    events: [{ eventId: "e-1", type: "rep_complete", timestampMs: 1200, repIndex: 1 }],
    summary: { repCount: 1, analyzedDurationMs: 1400 }
  });
  assert.equal(hasPlayableMediaSource(session), false);
  assert.equal(hasMeaningfulAnalysisOutput(session), true);
  assert.equal(isReviewableSession(session), true);
});

test("reviewable session detection rejects empty failed attempts even with source uri", () => {
  const session = buildSession({
    status: "failed",
    rawVideoUri: undefined,
    annotatedVideoUri: undefined,
    sourceUri: "upload://local/upload-job-failed/attempt.mp4",
    frameSamples: [],
    events: [],
    summary: { repCount: 0, analyzedDurationMs: 0, holdDurationMs: 0 }
  });
  assert.equal(hasPlayableMediaSource(session), false);
  assert.equal(hasMeaningfulAnalysisOutput(session), false);
  assert.equal(isReviewableSession(session), false);
});
