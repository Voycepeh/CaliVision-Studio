import test from "node:test";
import assert from "node:assert/strict";
import { createLiveTraceAccumulator, normalizeTraceToVideoDuration } from "./session-trace.ts";

const drill = {
  drillId: "d1",
  title: "Pushup",
  phases: [
    { phaseId: "up", name: "Up", poseSequence: [{ joints: { leftShoulder: { x: 0.5, y: 0.2 }, rightShoulder: { x: 0.6, y: 0.2 } } }] },
    { phaseId: "down", name: "Down", poseSequence: [{ joints: { leftShoulder: { x: 0.5, y: 0.8 }, rightShoulder: { x: 0.6, y: 0.8 } } }] }
  ],
  analysis: {
    measurementType: "rep",
    orderedPhaseSequence: ["up", "down"],
    minimumRepDurationMs: 0,
    cooldownMs: 0,
    minimumHoldDurationMs: 0
  }
} as const;

test("trace retention captures rep and hold events with timestamps", () => {
  const trace = createLiveTraceAccumulator({
    traceId: "trace_1",
    startedAtIso: "2026-04-08T00:00:00.000Z",
    drillSelection: {
      mode: "drill",
      drill: drill as never,
      cameraView: "side",
      drillBindingLabel: drill.title,
      drillBindingSource: "local"
    },
    cadenceFps: 10
  });

  trace.pushFrame({ timestampMs: 0, joints: drill.phases[0].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 200, joints: drill.phases[0].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 400, joints: drill.phases[1].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 600, joints: drill.phases[1].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 800, joints: drill.phases[0].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 900, joints: drill.phases[0].poseSequence[0].joints });

  const finalized = trace.finalize({ durationMs: 1000, width: 720, height: 1280, mimeType: "video/webm", sizeBytes: 2000, timing: { mediaStartMs: 0, mediaStopMs: 1000, captureStartPerfNowMs: 10, captureStopPerfNowMs: 1010 } }, "2026-04-08T00:00:03.000Z");
  assert.equal(finalized.captures.length, 6);
  assert.equal(finalized.drillSelection.cameraView, "side");
  assert.ok(finalized.events.some((event) => event.type === "phase_enter"));
  assert.ok((finalized.summary.repCount ?? 0) >= 1);
});

test("trace timestamps can be normalized to finalized video duration for export alignment", () => {
  const normalized = normalizeTraceToVideoDuration(
    [
      {
        timestampMs: 0,
        frame: { timestampMs: 0, joints: {} },
        frameSample: { timestampMs: 0, confidence: 0.4 }
      },
      {
        timestampMs: 1100,
        frame: { timestampMs: 1100, joints: {} },
        frameSample: { timestampMs: 1100, confidence: 0.5 }
      }
    ],
    [{ eventId: "evt_1", timestampMs: 1100, type: "phase_enter", phaseId: "down" }],
    1000
  );

  assert.equal(normalized.captures[1]?.timestampMs, 1000);
  assert.equal(normalized.captures[1]?.frame.timestampMs, 1000);
  assert.equal(normalized.events[0]?.timestampMs, 1000);
});

test("phase transitions require confirmation and ignore confidence gate jitter", () => {
  const trace = createLiveTraceAccumulator({
    traceId: "trace_2",
    startedAtIso: "2026-04-08T00:00:00.000Z",
    drillSelection: {
      mode: "drill",
      drill: drill as never,
      drillBindingLabel: drill.title,
      drillBindingSource: "local"
    },
    cadenceFps: 10
  });

  trace.pushFrame({ timestampMs: 0, joints: drill.phases[0].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 100, joints: drill.phases[0].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 200, joints: {} });
  trace.pushFrame({ timestampMs: 300, joints: drill.phases[1].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 400, joints: drill.phases[1].poseSequence[0].joints });

  const finalized = trace.finalize(
    {
      durationMs: 500,
      width: 720,
      height: 1280,
      mimeType: "video/webm",
      sizeBytes: 2000,
      timing: { mediaStartMs: 0, mediaStopMs: 500, captureStartPerfNowMs: 10, captureStopPerfNowMs: 510 }
    },
    "2026-04-08T00:00:01.000Z"
  );

  const phaseEnterEvents = finalized.events.filter((event) => event.type === "phase_enter");
  assert.equal(phaseEnterEvents.length, 2);
  assert.equal(phaseEnterEvents[0]?.phaseId, "up");
  assert.equal(phaseEnterEvents[1]?.phaseId, "down");
  assert.equal(phaseEnterEvents[1]?.timestampMs, 500);
});

test("analyzed frame state keeps pose and overlay synchronized by timestamp", () => {
  const trace = createLiveTraceAccumulator({
    traceId: "trace_sync",
    startedAtIso: "2026-04-08T00:00:00.000Z",
    drillSelection: {
      mode: "drill",
      drill: drill as never,
      drillBindingLabel: drill.title,
      drillBindingSource: "local"
    },
    cadenceFps: 10
  });

  trace.pushFrame({ timestampMs: 0, joints: drill.phases[0].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 250, joints: drill.phases[1].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 500, joints: drill.phases[1].poseSequence[0].joints });

  const analyzed = trace.getAnalyzedFrameState(400);
  assert.equal(analyzed.poseFrame?.timestampMs, 250);
  assert.ok(analyzed.overlay.timestampMs >= 0);
});

test("finalized live trace preserves advancing capture and source media timestamps", () => {
  const trace = createLiveTraceAccumulator({
    traceId: "trace_source_advancing",
    startedAtIso: "2026-04-08T00:00:00.000Z",
    drillSelection: {
      mode: "drill",
      drill: drill as never,
      drillBindingLabel: drill.title,
      drillBindingSource: "local"
    },
    cadenceFps: 10
  });

  trace.pushFrame({ timestampMs: 0, joints: drill.phases[0].poseSequence[0].joints }, { sourceMediaTimeMs: 0 });
  trace.pushFrame({ timestampMs: 180, joints: drill.phases[0].poseSequence[0].joints }, { sourceMediaTimeMs: 170 });
  trace.pushFrame({ timestampMs: 360, joints: drill.phases[1].poseSequence[0].joints }, { sourceMediaTimeMs: 350 });

  const finalized = trace.finalize(
    {
      durationMs: 400,
      width: 720,
      height: 1280,
      mimeType: "video/webm",
      sizeBytes: 2000,
      timing: { mediaStartMs: 0, mediaStopMs: 400, captureStartPerfNowMs: 10, captureStopPerfNowMs: 410 }
    },
    "2026-04-08T00:00:01.000Z"
  );

  assert.equal(finalized.captures.length, 3);
  assert.ok((finalized.captures[1]?.timestampMs ?? 0) > (finalized.captures[0]?.timestampMs ?? 0));
  assert.ok((finalized.captures[2]?.sourceMediaTimeMs ?? 0) > (finalized.captures[1]?.sourceMediaTimeMs ?? 0));
});


test("hold drills still accumulate hold duration without rep progression", () => {
  const holdDrill = {
    ...drill,
    analysis: {
      ...drill.analysis,
      measurementType: "hold" as const,
      targetHoldPhaseId: "up",
      minimumHoldDurationMs: 0
    }
  };

  const trace = createLiveTraceAccumulator({
    traceId: "trace_hold",
    startedAtIso: "2026-04-08T00:00:00.000Z",
    drillSelection: {
      mode: "drill",
      drill: holdDrill as never,
      drillBindingLabel: holdDrill.title,
      drillBindingSource: "local"
    },
    cadenceFps: 10
  });

  trace.pushFrame({ timestampMs: 0, joints: holdDrill.phases[0].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 100, joints: holdDrill.phases[0].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 500, joints: holdDrill.phases[1].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 700, joints: holdDrill.phases[1].poseSequence[0].joints });

  const finalized = trace.finalize(
    {
      durationMs: 800,
      width: 720,
      height: 1280,
      mimeType: "video/webm",
      sizeBytes: 2000,
      timing: { mediaStartMs: 0, mediaStopMs: 800, captureStartPerfNowMs: 10, captureStopPerfNowMs: 810 }
    },
    "2026-04-08T00:00:03.000Z"
  );

  assert.equal(finalized.summary.repCount, 0);
  assert.ok((finalized.summary.holdDurationMs ?? 0) > 0);
});

test("single-phase hold drills keep accumulating through finalize and infer hold_end", () => {
  const singleHoldDrill = {
    ...drill,
    phases: [drill.phases[0]],
    analysis: {
      ...drill.analysis,
      measurementType: "hold" as const,
      targetHoldPhaseId: "up",
      minimumHoldDurationMs: 0
    }
  };
  const trace = createLiveTraceAccumulator({
    traceId: "trace_single_phase_hold",
    startedAtIso: "2026-04-08T00:00:00.000Z",
    drillSelection: {
      mode: "drill",
      drill: singleHoldDrill as never,
      drillBindingLabel: singleHoldDrill.title,
      drillBindingSource: "local"
    },
    cadenceFps: 10
  });

  trace.pushFrame({ timestampMs: 0, joints: singleHoldDrill.phases[0].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 100, joints: singleHoldDrill.phases[0].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 500, joints: singleHoldDrill.phases[0].poseSequence[0].joints });

  assert.equal(trace.getHoldDurationMsAtTimestamp(500), 500);

  const finalized = trace.finalize(
    {
      durationMs: 1000,
      width: 720,
      height: 1280,
      mimeType: "video/webm",
      sizeBytes: 2000,
      timing: { mediaStartMs: 0, mediaStopMs: 1000, captureStartPerfNowMs: 10, captureStopPerfNowMs: 1010 }
    },
    "2026-04-08T00:00:03.000Z"
  );

  assert.equal(finalized.summary.holdDurationMs, 1000);
  const holdEnd = finalized.events.find((event) => event.type === "hold_end");
  assert.ok(holdEnd);
  assert.equal(holdEnd?.details?.inferredSessionEnd, true);
});

test("rep drills do not emit hold events or accumulate hold duration", () => {
  const trace = createLiveTraceAccumulator({
    traceId: "trace_rep_still_rep",
    startedAtIso: "2026-04-08T00:00:00.000Z",
    drillSelection: {
      mode: "drill",
      drill: drill as never,
      drillBindingLabel: drill.title,
      drillBindingSource: "local"
    },
    cadenceFps: 10
  });

  trace.pushFrame({ timestampMs: 0, joints: drill.phases[0].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 100, joints: drill.phases[0].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 200, joints: drill.phases[1].poseSequence[0].joints });
  trace.pushFrame({ timestampMs: 300, joints: drill.phases[1].poseSequence[0].joints });

  const finalized = trace.finalize(
    {
      durationMs: 400,
      width: 720,
      height: 1280,
      mimeType: "video/webm",
      sizeBytes: 2000,
      timing: { mediaStartMs: 0, mediaStopMs: 400, captureStartPerfNowMs: 10, captureStopPerfNowMs: 410 }
    },
    "2026-04-08T00:00:01.000Z"
  );

  assert.equal(finalized.summary.holdDurationMs, 0);
  assert.equal(finalized.events.some((event) => event.type === "hold_start" || event.type === "hold_end"), false);
});
