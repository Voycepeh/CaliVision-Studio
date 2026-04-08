import test from "node:test";
import assert from "node:assert/strict";
import {
  findLatestSessionForUpload,
  getLifecycleLabel,
  getSessionOutcomeLabel,
  getUploadLifecycleState,
  summarizeSessionAvailability
} from "./analysis-session-ux.ts";
import type { AnalysisSessionRecord } from "../analysis/session-repository.ts";
import type { UploadJob } from "./types.ts";

function buildUploadJob(overrides: Partial<UploadJob> = {}): UploadJob {
  return {
    id: "job-1",
    file: new File(["video"], "attempt.mp4", { type: "video/mp4" }),
    fileName: "attempt.mp4",
    fileSizeBytes: 1024,
    status: "queued",
    stageLabel: "Ready",
    progress: 0,
    createdAtIso: "2026-04-08T00:00:00.000Z",
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
