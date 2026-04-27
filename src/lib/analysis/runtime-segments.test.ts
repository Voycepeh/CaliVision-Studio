import assert from "node:assert/strict";
import test from "node:test";
import { mapLiveAnalysisToRuntimeSegments, mapUploadAnalysisToRuntimeSegments } from "./runtime-segments.ts";

test("mapUploadAnalysisToRuntimeSegments maps completed and partial rep segments with phase timings", () => {
  const segments = mapUploadAnalysisToRuntimeSegments({
    session: {
      sessionId: "sess_upload_1",
      drillId: "drill_pushup",
      summary: {
        partialAttemptCount: 1,
        invalidTransitionCount: 2,
        detectedPhaseCoverage: 0.82,
        lowConfidenceFrames: 4
      },
      events: [
        { eventId: "e1", timestampMs: 100, type: "phase_enter", phaseId: "start" },
        { eventId: "e2", timestampMs: 600, type: "phase_enter", phaseId: "bottom" },
        { eventId: "e3", timestampMs: 1200, type: "rep_complete", repIndex: 1, details: { loopStartTimestampMs: 100, repDurationMs: 1100 } },
        {
          eventId: "e4",
          timestampMs: 1900,
          type: "partial_attempt",
          details: {
            loopStartTimestampMs: 1300,
            loopEndTimestampMs: 1900,
            repDurationMs: 600,
            rejectReason: "below_minimum_rep_duration",
            minRepDurationMs: 700
          }
        }
      ]
    },
    attemptId: "attempt_1",
    mainFinding: "Drive through the top phase more consistently."
  });

  assert.equal(segments.length, 2);
  assert.equal(segments[0]?.segmentType, "rep");
  assert.equal(segments[0]?.status, "completed");
  assert.equal(segments[0]?.durationSec, 1.1);
  assert.equal(segments[0]?.phaseTimings?.length, 2);
  assert.equal(segments[0]?.mainFinding, "Drive through the top phase more consistently.");

  assert.equal(segments[1]?.segmentType, "rep");
  assert.equal(segments[1]?.status, "failed");
  assert.equal(segments[1]?.keyMetrics?.minRepDurationSec, 0.7);
  assert.equal(segments[1]?.attemptId, "attempt_1");
});

test("mapLiveAnalysisToRuntimeSegments maps hold windows and defensive partials", () => {
  const segments = mapLiveAnalysisToRuntimeSegments({
    session: {
      sessionId: "sess_live_1",
      drillId: "drill_plank",
      summary: {
        partialAttemptCount: 0
      },
      events: [
        { eventId: "h1", timestampMs: 500, type: "hold_start", phaseId: "hold" },
        { eventId: "h2", timestampMs: 2700, type: "hold_end", phaseId: "hold", details: { durationMs: 2200, qualified: true } },
        { eventId: "h3", timestampMs: 3000, type: "hold_start", phaseId: "hold" }
      ]
    }
  });

  assert.equal(segments.length, 2);
  assert.equal(segments[0]?.segmentType, "hold");
  assert.equal(segments[0]?.status, "completed");
  assert.equal(segments[0]?.holdStableWindow?.durationSec, 2.2);

  assert.equal(segments[1]?.segmentType, "hold");
  assert.equal(segments[1]?.status, "partial");
  assert.equal(segments[1]?.holdStableWindow, undefined);
  assert.equal(segments[1]?.source, "live");
});


test("mapUploadAnalysisToRuntimeSegments excludes terminal phase_enter at rep end boundary", () => {
  const segments = mapUploadAnalysisToRuntimeSegments({
    session: {
      sessionId: "sess_upload_terminal_boundary",
      drillId: "drill_pushup",
      summary: {},
      events: [
        { eventId: "e1", timestampMs: 100, type: "phase_enter", phaseId: "start" },
        { eventId: "e2", timestampMs: 600, type: "phase_enter", phaseId: "bottom" },
        { eventId: "e3", timestampMs: 1200, type: "phase_enter", phaseId: "start" },
        {
          eventId: "e4",
          timestampMs: 1200,
          type: "rep_complete",
          repIndex: 1,
          details: { loopStartTimestampMs: 100, loopEndTimestampMs: 1200, repDurationMs: 1100 }
        }
      ]
    }
  });

  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.segmentType, "rep");
  assert.equal(segments[0]?.status, "completed");
  assert.equal(segments[0]?.phaseTimings?.length, 2);
  assert.equal(segments[0]?.phaseTimings?.some((phase) => phase.durationSec === 0), false);
});
