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
