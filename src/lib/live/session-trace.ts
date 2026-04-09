import { scoreFramesAgainstDrillPhases } from "../analysis/frame-phase-scorer.ts";
import type { AnalysisEvent, PortableDrill } from "../schema/contracts.ts";
import type { PoseFrame } from "../upload/types.ts";
import type { LiveDrillSelection, LiveSessionTrace } from "./types.ts";

type TraceState = {
  captures: LiveSessionTrace["captures"];
  events: AnalysisEvent[];
  repCount: number;
  holdDurationMs: number;
  partialAttemptCount: number;
  invalidTransitionCount: number;
  confidenceTotal: number;
  confidenceCount: number;
  lowConfidenceFrames: number;
  currentPhaseId: string | null;
  activeHoldStartMs: number | null;
  expectedSequenceIndex: number;
};

function scaleTimestamp(timestampMs: number, scale: number, maxDurationMs: number): number {
  return Math.max(0, Math.min(maxDurationMs, Math.round(timestampMs * scale)));
}

export function normalizeTraceToVideoDuration(
  captures: LiveSessionTrace["captures"],
  events: AnalysisEvent[],
  durationMs: number
): { captures: LiveSessionTrace["captures"]; events: AnalysisEvent[] } {
  const lastTraceTimestampMs = captures[captures.length - 1]?.timestampMs ?? events[events.length - 1]?.timestampMs ?? durationMs;
  if (lastTraceTimestampMs <= 0 || durationMs <= 0) {
    return { captures, events };
  }

  const scale = durationMs / lastTraceTimestampMs;
  if (!Number.isFinite(scale) || Math.abs(1 - scale) < 0.005) {
    return { captures, events };
  }

  return {
    captures: captures.map((capture) => {
      const timestampMs = scaleTimestamp(capture.timestampMs, scale, durationMs);
      return {
        ...capture,
        timestampMs,
        frame: { ...capture.frame, timestampMs },
        frameSample: { ...capture.frameSample, timestampMs }
      };
    }),
    events: events.map((event) => ({
      ...event,
      timestampMs: scaleTimestamp(event.timestampMs, scale, durationMs)
    }))
  };
}

export function createLiveTraceAccumulator(input: {
  traceId: string;
  startedAtIso: string;
  drillSelection: LiveDrillSelection;
  cadenceFps: number;
}) {
  const state: TraceState = {
    captures: [],
    events: [],
    repCount: 0,
    holdDurationMs: 0,
    partialAttemptCount: 0,
    invalidTransitionCount: 0,
    confidenceTotal: 0,
    confidenceCount: 0,
    lowConfidenceFrames: 0,
    currentPhaseId: null,
    activeHoldStartMs: null,
    expectedSequenceIndex: 0
  };

  const addEvent = (event: Omit<AnalysisEvent, "eventId">) => {
    state.events.push({ ...event, eventId: `evt_${state.events.length + 1}` });
  };

  const applyTransition = (drill: PortableDrill | undefined, nextPhaseId: string | null, timestampMs: number) => {
    if (state.currentPhaseId === nextPhaseId) {
      return;
    }

    if (state.currentPhaseId) {
      addEvent({ timestampMs, type: "phase_exit", phaseId: state.currentPhaseId });
    }

    if (nextPhaseId) {
      addEvent({ timestampMs, type: "phase_enter", phaseId: nextPhaseId });
    }

    if (drill?.analysis?.orderedPhaseSequence?.length) {
      const seq = drill.analysis.orderedPhaseSequence;
      const expectedPhase = seq[state.expectedSequenceIndex];
      const index = seq.indexOf(nextPhaseId ?? "");

      if (nextPhaseId === expectedPhase) {
        state.expectedSequenceIndex += 1;
        if (state.expectedSequenceIndex >= seq.length) {
          state.repCount += 1;
          addEvent({ timestampMs, type: "rep_complete", repIndex: state.repCount });
          state.expectedSequenceIndex = 0;
        }
      } else if (index >= 0) {
        state.partialAttemptCount += 1;
        addEvent({ timestampMs, type: "partial_attempt", details: { reason: "sequence_reset" } });
        state.expectedSequenceIndex = index + 1;
      }
    }

    const targetHold = drill?.analysis?.targetHoldPhaseId ?? drill?.analysis?.orderedPhaseSequence?.[0];
    if (targetHold) {
      if (nextPhaseId === targetHold && state.activeHoldStartMs === null) {
        state.activeHoldStartMs = timestampMs;
        addEvent({ timestampMs, type: "hold_start", phaseId: targetHold });
      } else if (state.currentPhaseId === targetHold && nextPhaseId !== targetHold && state.activeHoldStartMs !== null) {
        const durationMs = Math.max(0, timestampMs - state.activeHoldStartMs);
        state.holdDurationMs += durationMs;
        addEvent({ timestampMs, type: "hold_end", phaseId: targetHold, details: { durationMs, qualified: true } });
        state.activeHoldStartMs = null;
      }
    }

    state.currentPhaseId = nextPhaseId;
  };

  const inferFrameSample = (frame: PoseFrame, drill: PortableDrill | undefined) => {
    if (!drill) {
      return { timestampMs: frame.timestampMs, confidence: 0, classifiedPhaseId: undefined };
    }
    const score = scoreFramesAgainstDrillPhases([frame], drill.phases, { includePerPhaseScores: true })[0];
    return {
      timestampMs: frame.timestampMs,
      confidence: score?.bestPhaseScore ?? 0,
      classifiedPhaseId: score?.bestPhaseId ?? undefined,
      perPhaseScores: score?.perPhaseScores
    };
  };

  return {
    pushFrame(frame: PoseFrame) {
      const frameSample = inferFrameSample(frame, input.drillSelection.drill);
      state.captures.push({ timestampMs: frame.timestampMs, frame, frameSample });
      state.confidenceTotal += frameSample.confidence;
      state.confidenceCount += 1;
      if (frameSample.confidence < 0.35) {
        state.lowConfidenceFrames += 1;
      }

      applyTransition(input.drillSelection.drill, frameSample.classifiedPhaseId ?? null, frame.timestampMs);
    },

    finalize(
      video: {
        durationMs: number;
        width: number;
        height: number;
        mimeType: string;
        sizeBytes: number;
        timing: {
          mediaStartMs: number;
          mediaStopMs: number;
          captureStartPerfNowMs: number;
          captureStopPerfNowMs: number;
        };
      },
      completedAtIso: string
    ): LiveSessionTrace {
      if (state.activeHoldStartMs !== null) {
        const endMs = Math.max(video.durationMs, state.activeHoldStartMs);
        const targetHold = input.drillSelection.drill?.analysis?.targetHoldPhaseId ?? input.drillSelection.drill?.analysis?.orderedPhaseSequence?.[0];
        const durationMs = endMs - state.activeHoldStartMs;
        state.holdDurationMs += durationMs;
        if (targetHold) {
          addEvent({ timestampMs: endMs, type: "hold_end", phaseId: targetHold, details: { durationMs, qualified: true, inferredSessionEnd: true } });
        }
      }

      const normalized = normalizeTraceToVideoDuration(state.captures, state.events, video.durationMs);

      return {
        schemaVersion: "live-session-trace-v1",
        traceId: input.traceId,
        startedAtIso: input.startedAtIso,
        completedAtIso,
        sourceType: "browser-camera",
        drillSelection: input.drillSelection,
        cadenceFps: input.cadenceFps,
        video,
        captures: normalized.captures,
        events: normalized.events,
        summary: {
          repCount: state.repCount,
          holdDurationMs: Math.round(state.holdDurationMs),
          partialAttemptCount: state.partialAttemptCount,
          invalidTransitionCount: state.invalidTransitionCount,
          analyzedDurationMs: video.durationMs,
          confidenceAvg: state.confidenceCount ? state.confidenceTotal / state.confidenceCount : 0,
          lowConfidenceFrames: state.lowConfidenceFrames
        }
      };
    }
  };
}
