import { scoreFramesAgainstDrillPhases } from "../analysis/frame-phase-scorer.ts";
import { buildPhaseRuntimeModel } from "../analysis/phase-runtime.ts";
import { deriveReplayOverlayStateAtTime } from "../analysis/replay-state.ts";
import type { AnalysisSessionRecord } from "../analysis/session-repository.ts";
import type { AnalysisEvent, PortableDrill } from "../schema/contracts.ts";
import type { PoseFrame } from "../upload/types.ts";
import type { LiveAnalyzedFrameState, LiveDrillSelection, LiveSessionTrace } from "./types.ts";

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
  pendingPhaseId: string | null;
  pendingPhaseFrameCount: number;
  confidenceGateOpen: boolean;
  activeHoldStartMs: number | null;
  expectedSequenceIndex: number;
  runtimeSequence: string[];
  allowedTransitionKeys: Set<string>;
  phaseLabelById: Record<string, string>;
};
const PHASE_CONFIRMATION_FRAMES = 2;
const PHASE_CONFIDENCE_GATE_ENTER = 0.42;
const PHASE_CONFIDENCE_GATE_EXIT = 0.3;

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
    pendingPhaseId: null,
    pendingPhaseFrameCount: 0,
    confidenceGateOpen: false,
    activeHoldStartMs: null,
    expectedSequenceIndex: 0,
    runtimeSequence: [],
    allowedTransitionKeys: new Set<string>(),
    phaseLabelById: {}
  };

  const addEvent = (event: Omit<AnalysisEvent, "eventId">) => {
    state.events.push({ ...event, eventId: `evt_${state.events.length + 1}` });
  };

  const applyTransition = (drill: PortableDrill | undefined, nextPhaseId: string | null, timestampMs: number) => {
    if (state.currentPhaseId === nextPhaseId) {
      return;
    }

    if (drill?.analysis && state.runtimeSequence.length === 0) {
      const runtimeModel = buildPhaseRuntimeModel(drill, drill.analysis);
      state.runtimeSequence = runtimeModel.orderedPhaseIds;
      state.allowedTransitionKeys = runtimeModel.allowedTransitionKeys;
      state.phaseLabelById = runtimeModel.phaseLabelById;
    }

    if (state.currentPhaseId && nextPhaseId) {
      const key = `${state.currentPhaseId}->${nextPhaseId}`;
      if (state.allowedTransitionKeys.size > 0 && !state.allowedTransitionKeys.has(key)) {
        state.invalidTransitionCount += 1;
        addEvent({
          timestampMs,
          type: "invalid_transition",
          fromPhaseId: state.currentPhaseId,
          toPhaseId: nextPhaseId,
          details: { reason: "off_path_transition", message: "transition rejected: off authored path" }
        });
        return;
      }
    }

    if (state.currentPhaseId) {
      addEvent({ timestampMs, type: "phase_exit", phaseId: state.currentPhaseId });
    }

    if (nextPhaseId) {
      addEvent({ timestampMs, type: "phase_enter", phaseId: nextPhaseId });
    }

    if (state.runtimeSequence.length) {
      const seq = state.runtimeSequence;
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

  const toReplayCompatibleSession = (): AnalysisSessionRecord => {
    const drill = input.drillSelection.drill;
    return {
      sessionId: `${input.traceId}_live_overlay`,
      drillId: drill?.drillId ?? "freestyle",
      drillTitle: drill?.title ?? "No drill",
      drillVersion: input.drillSelection.drillVersion,
      drillMeasurementType: drill?.analysis?.measurementType ?? drill?.drillType,
      pipelineVersion: "live-session-trace-v1",
      scorerVersion: "frame-phase-scorer-v1",
      sourceKind: "live",
      sourceId: input.traceId,
      sourceLabel: "Live overlay",
      status: "partial",
      createdAtIso: input.startedAtIso,
      summary: {
        repCount: state.repCount,
        holdDurationMs: Math.round(state.holdDurationMs),
        analyzedDurationMs: state.captures.at(-1)?.timestampMs ?? 0
      },
      frameSamples: state.captures.map((capture) => capture.frameSample),
      events: state.events
    };
  };

  const getCaptureAtTime = (timestampMs: number): LiveSessionTrace["captures"][number] | null => {
    if (state.captures.length === 0) {
      return null;
    }
    let candidate = state.captures[0];
    for (const capture of state.captures) {
      if (capture.timestampMs > timestampMs) {
        break;
      }
      candidate = capture;
    }
    return candidate ?? null;
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

      if (state.confidenceGateOpen) {
        state.confidenceGateOpen = frameSample.confidence >= PHASE_CONFIDENCE_GATE_EXIT;
      } else {
        state.confidenceGateOpen = frameSample.confidence >= PHASE_CONFIDENCE_GATE_ENTER;
      }

      const candidatePhaseId = state.confidenceGateOpen ? (frameSample.classifiedPhaseId ?? null) : null;
      if (candidatePhaseId === state.currentPhaseId) {
        state.pendingPhaseId = null;
        state.pendingPhaseFrameCount = 0;
        return;
      }

      if (candidatePhaseId !== state.pendingPhaseId) {
        state.pendingPhaseId = candidatePhaseId;
        state.pendingPhaseFrameCount = 1;
        return;
      }

      state.pendingPhaseFrameCount += 1;
      if (state.pendingPhaseFrameCount < PHASE_CONFIRMATION_FRAMES) {
        return;
      }

      applyTransition(input.drillSelection.drill, candidatePhaseId, frame.timestampMs);
      state.pendingPhaseId = null;
      state.pendingPhaseFrameCount = 0;
    },

    getOverlayState(timestampMs: number) {
      return deriveReplayOverlayStateAtTime(toReplayCompatibleSession(), timestampMs);
    },

    getAnalyzedFrameState(timestampMs: number): LiveAnalyzedFrameState {
      const overlay = deriveReplayOverlayStateAtTime(toReplayCompatibleSession(), timestampMs);
      const capture = getCaptureAtTime(overlay.timestampMs);
      return {
        timestampMs: overlay.timestampMs,
        poseFrame: capture?.frame ?? null,
        frameConfidence: typeof capture?.frameSample.confidence === "number" ? capture.frameSample.confidence : null,
        overlay
      };
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
