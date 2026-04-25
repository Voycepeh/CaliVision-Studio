import { scoreFramesAgainstDrillPhases } from "../analysis/frame-phase-scorer.ts";
import { buildPhaseRuntimeModel, resolveDrillMeasurementType, type PhaseRuntimeModel } from "../analysis/phase-runtime.ts";
import { deriveReplayOverlayStateAtTime } from "../analysis/replay-state.ts";
import { advanceRepSequence, createRepSequenceProgress, type RepSequenceProgress } from "../analysis/rep-sequence-engine.ts";
import type { FramePhaseScoreDebug } from "../analysis/types.ts";
import type { AnalysisSessionRecord } from "../analysis/session-repository.ts";
import type { AnalysisEvent, PortableDrill } from "../schema/contracts.ts";
import type { PoseFrame } from "../upload/types.ts";
import type { LiveAnalyzedFrameState, LiveDrillSelection, LiveSessionTrace } from "./types.ts";

type TraceState = {
  captures: LiveSessionTrace["captures"];
  events: AnalysisEvent[];
  repCount: number;
  completedHoldDurationMs: number;
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
  repProgress: RepSequenceProgress;
  runtimeModel: PhaseRuntimeModel | null;
};
const PHASE_CONFIRMATION_FRAMES = 2;
const PHASE_CONFIDENCE_GATE_ENTER = 0.42;
const PHASE_CONFIDENCE_GATE_EXIT = 0.3;
const REP_PHASE_ENTER_FLOOR = 0.32;
const REP_NEAR_WINNER_SCORE_DELTA = 0.08;
const ARM_DELTA_PROMOTION_MIN = 0.01;
const ARM_DELTA_MEANINGFUL_DISTANCE = 0.1;

function shouldDebugRepSequence(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean((window as typeof window & { __CALI_DEBUG_REP_SEQUENCE?: boolean }).__CALI_DEBUG_REP_SEQUENCE);
}

function scaleTimestamp(timestampMs: number, scale: number, maxDurationMs: number): number {
  return Math.max(0, Math.min(maxDurationMs, Math.round(timestampMs * scale)));
}

const ARM_TRACKED_JOINTS = ["leftWrist", "rightWrist", "leftElbow", "rightElbow"] as const;

function averageArmDelta(
  phaseComparisons: FramePhaseScoreDebug["phaseComparisons"],
  phaseId: string | null
): number | null {
  if (!phaseId) {
    return null;
  }
  const perJoint = phaseComparisons[phaseId]?.perJointDelta;
  if (!perJoint) {
    return null;
  }
  const values = ARM_TRACKED_JOINTS
    .map((jointName) => perJoint[jointName])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveExpectedNextPhaseId(runtimeModel: PhaseRuntimeModel | null, currentPhaseId: string | null): string | null {
  if (!runtimeModel || !currentPhaseId) {
    return null;
  }
  const currentIndex = runtimeModel.loopPhaseIds.findIndex((phaseId) => phaseId === currentPhaseId);
  if (currentIndex < 0 || currentIndex >= runtimeModel.loopPhaseIds.length - 1) {
    return null;
  }
  return runtimeModel.loopPhaseIds[currentIndex + 1] ?? null;
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
        sourceMediaTimeMs: capture.sourceMediaTimeMs,
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
    completedHoldDurationMs: 0,
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
    repProgress: createRepSequenceProgress(),
    runtimeModel: input.drillSelection.drill?.analysis
      ? buildPhaseRuntimeModel(input.drillSelection.drill, input.drillSelection.drill.analysis)
      : null
  };

  const addEvent = (event: Omit<AnalysisEvent, "eventId">) => {
    state.events.push({ ...event, eventId: `evt_${state.events.length + 1}` });
  };

  const getHoldDurationMsAtTimestamp = (timestampMs: number): number => {
    const clampedTimestampMs = Math.max(0, Math.round(timestampMs));
    if (state.activeHoldStartMs === null || clampedTimestampMs <= state.activeHoldStartMs) {
      return Math.max(0, Math.round(state.completedHoldDurationMs));
    }
    return Math.max(0, Math.round(state.completedHoldDurationMs + (clampedTimestampMs - state.activeHoldStartMs)));
  };

  const closeActiveHold = (
    timestampMs: number,
    options?: {
      inferredSessionEnd?: boolean;
      exitReason?: "phase_exit" | "phase_replaced" | "match_rejected" | "low_confidence" | "session_end";
      qualified?: boolean;
    }
  ) => {
    if (state.activeHoldStartMs === null) {
      return;
    }
    const targetHold = state.runtimeModel?.holdPhaseId;
    const endMs = Math.max(state.activeHoldStartMs, Math.round(timestampMs));
    const durationMs = Math.max(0, endMs - state.activeHoldStartMs);
    state.completedHoldDurationMs += durationMs;
    if (targetHold) {
      const details: NonNullable<AnalysisEvent["details"]> = {
        durationMs,
        qualified: options?.qualified ?? true,
        exitReason: options?.exitReason ?? (options?.inferredSessionEnd ? "session_end" : "phase_replaced")
      };
      if (options?.inferredSessionEnd) {
        details.inferredSessionEnd = true;
      }
      addEvent({
        timestampMs: endMs,
        type: "hold_end",
        phaseId: targetHold,
        details
      });
    }
    state.activeHoldStartMs = null;
  };

  const updateHoldTracking = (observedPhaseId: string | null, timestampMs: number) => {
    const targetHold = state.runtimeModel?.holdPhaseId;
    if (state.runtimeModel?.measurementMode !== "hold" || !targetHold) {
      return;
    }
    if (observedPhaseId === targetHold) {
      if (state.activeHoldStartMs === null) {
        state.activeHoldStartMs = timestampMs;
        addEvent({ timestampMs, type: "hold_start", phaseId: targetHold });
      }
      return;
    }
    closeActiveHold(timestampMs, { exitReason: "phase_replaced" });
  };

  const applyTransition = (drill: PortableDrill | undefined, nextPhaseId: string | null, timestampMs: number) => {
    if (state.currentPhaseId === nextPhaseId) {
      return;
    }

    if (drill?.analysis && !state.runtimeModel) {
      state.runtimeModel = buildPhaseRuntimeModel(drill, drill.analysis);
    }

    if (nextPhaseId && state.runtimeModel && !state.runtimeModel.phaseById[nextPhaseId]) {
      state.invalidTransitionCount += 1;
      addEvent({
        timestampMs,
        type: "invalid_transition",
        fromPhaseId: state.currentPhaseId ?? undefined,
        toPhaseId: nextPhaseId,
        details: { reason: "unknown_runtime_phase", message: "transition rejected: phase is outside authored loop" }
      });
      return;
    }

    if (state.currentPhaseId && nextPhaseId) {
      const key = `${state.currentPhaseId}->${nextPhaseId}`;
      if (state.runtimeModel?.allowedTransitionKeys.size && !state.runtimeModel.allowedTransitionKeys.has(key)) {
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

    if (state.runtimeModel?.measurementMode === "rep" && nextPhaseId) {
      const sequence = state.runtimeModel.loopPhaseIds;
      const analysis = drill?.analysis;
      const minimumRepDurationMs = Math.max(0, analysis?.minimumRepDurationMs ?? 0);
      const cooldownMs = Math.max(0, analysis?.cooldownMs ?? 0);
      const legacyMetadataIgnored = state.runtimeModel.legacyOrderMismatch;
      const step = advanceRepSequence({
        sequence,
        event: { timestampMs, phaseId: nextPhaseId },
        progress: state.repProgress,
        minimumRepDurationMs,
        cooldownMs,
        allowForwardJump: true
      });

      state.repCount = state.repProgress.repCount;
      state.partialAttemptCount = state.repProgress.partialAttemptCount;

      if (step.kind === "rep_complete") {
        addEvent({
          timestampMs,
          type: "rep_complete",
          repIndex: state.repProgress.repCount,
          details: {
            ...step.details,
            minRepDurationMs: minimumRepDurationMs,
            legacyMetadataIgnored
          }
        });
        if (shouldDebugRepSequence()) {
          console.debug("[rep-sequence] rep increment", {
            timestampMs,
            phaseId: nextPhaseId,
            expectedPhaseIndex: state.repProgress.expectedSequenceIndex,
            matchedSequenceProgress: `${state.repProgress.expectedSequenceIndex}/${Math.max(0, sequence.length - 1)}`,
            repCount: state.repProgress.repCount,
            details: step.details
          });
        }
      } else if (step.kind === "partial_attempt") {
        const expectedPhaseLabel = typeof step.details.expectedPhaseId === "string"
          ? state.runtimeModel.phaseLabelById[step.details.expectedPhaseId] ?? step.details.expectedPhaseId
          : null;
        const resumedAtPhaseLabel = typeof step.details.resumedAtPhaseId === "string"
          ? state.runtimeModel.phaseLabelById[step.details.resumedAtPhaseId] ?? step.details.resumedAtPhaseId
          : null;
        addEvent({
          timestampMs,
          type: "partial_attempt",
          details: {
            ...step.details,
            ...(expectedPhaseLabel ? { expectedPhaseLabel } : {}),
            ...(resumedAtPhaseLabel ? { resumedAtPhaseLabel } : {}),
            rejectReason: step.details.reason,
            minRepDurationMs: minimumRepDurationMs,
            legacyMetadataIgnored
          }
        });
        if (shouldDebugRepSequence()) {
          console.debug("[rep-sequence] reset", {
            timestampMs,
            phaseId: nextPhaseId,
            expectedPhaseIndex: state.repProgress.expectedSequenceIndex,
            matchedSequenceProgress: `${state.repProgress.expectedSequenceIndex}/${Math.max(0, sequence.length - 1)}`,
            repCount: state.repProgress.repCount,
            reason: step.details.reason
          });
        }
      }
    }

    updateHoldTracking(nextPhaseId, timestampMs);
    state.currentPhaseId = nextPhaseId;
  };

  const inferFrameSample = (frame: PoseFrame, drill: PortableDrill | undefined) => {
    if (!drill) {
      return { timestampMs: frame.timestampMs, confidence: 0, classifiedPhaseId: undefined };
    }
    const score = scoreFramesAgainstDrillPhases([frame], drill.phases, {
      includePerPhaseScores: true,
      cameraView: input.drillSelection.cameraView,
      minimumScoreThreshold: state.runtimeModel?.measurementMode === "rep" ? REP_PHASE_ENTER_FLOOR : undefined,
      holdTargetPhaseId: state.runtimeModel?.measurementMode === "hold" ? state.runtimeModel.holdPhaseId ?? undefined : undefined
    })[0];
    return {
      timestampMs: frame.timestampMs,
      confidence: score?.bestPhaseScore ?? 0,
      classifiedPhaseId: score?.bestPhaseId ?? undefined,
      perPhaseScores: score?.perPhaseScores,
      scoringDebug: score?.debug
    };
  };

  const toReplayCompatibleSession = (): AnalysisSessionRecord => {
    const drill = input.drillSelection.drill;
    return {
      sessionId: `${input.traceId}_live_overlay`,
      drillId: drill?.drillId ?? "freestyle",
      drillTitle: drill?.title ?? "No drill",
      drillVersion: input.drillSelection.drillVersion,
      drillMeasurementType: drill?.analysis ? resolveDrillMeasurementType(drill, drill.analysis) : drill?.drillType,
      pipelineVersion: "live-session-trace-v1",
      scorerVersion: "frame-phase-scorer-v1",
      sourceKind: "live",
      sourceId: input.traceId,
      sourceLabel: "Live overlay",
      status: "partial",
      createdAtIso: input.startedAtIso,
      summary: {
        repCount: state.repCount,
        holdDurationMs: getHoldDurationMsAtTimestamp(state.captures.at(-1)?.timestampMs ?? 0),
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
    pushFrame(frame: PoseFrame, options?: { sourceMediaTimeMs?: number }) {
      const frameSample = inferFrameSample(frame, input.drillSelection.drill);
      state.captures.push({
        timestampMs: frame.timestampMs,
        sourceMediaTimeMs: options?.sourceMediaTimeMs,
        frame,
        frameSample
      });
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

      const rawCandidatePhaseId = state.confidenceGateOpen ? (frameSample.classifiedPhaseId ?? null) : null;
      const runtimeCandidatePhaseId = rawCandidatePhaseId && state.runtimeModel && !state.runtimeModel.phaseById[rawCandidatePhaseId]
        ? null
        : rawCandidatePhaseId;
      let candidatePhaseId = runtimeCandidatePhaseId;
      const expectedNextPhaseId = resolveExpectedNextPhaseId(state.runtimeModel, state.currentPhaseId);
      let rejectedTransitionReason: string | null = null;
      let repPromotionReason: string | null = null;
      if (
        state.confidenceGateOpen
        && frameSample.confidence >= PHASE_CONFIDENCE_GATE_EXIT
        && frameSample.confidence >= REP_PHASE_ENTER_FLOOR
        && frameSample.perPhaseScores
        && state.runtimeModel?.measurementMode === "rep"
        && state.currentPhaseId
        && expectedNextPhaseId
        && frameSample.scoringDebug?.phaseComparisons
      ) {
        const perPhaseScores = frameSample.perPhaseScores ?? {};
        const currentScore = perPhaseScores[state.currentPhaseId] ?? 0;
        const expectedScore = perPhaseScores[expectedNextPhaseId] ?? 0;
        const armDeltaCurrent = averageArmDelta(frameSample.scoringDebug.phaseComparisons, state.currentPhaseId);
        const armDeltaExpected = averageArmDelta(frameSample.scoringDebug.phaseComparisons, expectedNextPhaseId);
        const armShiftMeaningful = armDeltaCurrent !== null
          && armDeltaExpected !== null
          && armDeltaCurrent >= ARM_DELTA_MEANINGFUL_DISTANCE
          && armDeltaCurrent - armDeltaExpected >= ARM_DELTA_PROMOTION_MIN;
        const phaseScoresClose = expectedScore >= currentScore - REP_NEAR_WINNER_SCORE_DELTA;
        const expectedAboveRepFloor = expectedScore >= REP_PHASE_ENTER_FLOOR;

        if (armShiftMeaningful && phaseScoresClose && expectedAboveRepFloor) {
          if (candidatePhaseId === null) {
            repPromotionReason = "expected_next_promoted_from_null";
          } else if (candidatePhaseId === state.currentPhaseId) {
            repPromotionReason = "expected_next_promoted_from_current";
          }
          if (repPromotionReason) {
            candidatePhaseId = expectedNextPhaseId;
          }
        }
      }

      if (!state.confidenceGateOpen) {
        rejectedTransitionReason = "confidence_gate_closed";
      } else if (!candidatePhaseId) {
        rejectedTransitionReason = "no_candidate_phase";
      } else if (candidatePhaseId === state.currentPhaseId) {
        rejectedTransitionReason = "candidate_matches_current_phase";
      }
      if (shouldDebugRepSequence()) {
        const expectedPhaseIndex = state.repProgress.expectedSequenceIndex;
        const sequenceExpectedPhaseId = state.runtimeModel?.loopPhaseIds[expectedPhaseIndex] ?? null;
        console.debug("[rep-sequence] frame", {
          timestampMs: frame.timestampMs,
          rawDetectedPhaseId: frameSample.classifiedPhaseId ?? null,
          rawBestPhaseId: frameSample.scoringDebug?.rawBestPhaseId ?? null,
          stabilizedPhaseId: state.currentPhaseId,
          candidatePhaseId: runtimeCandidatePhaseId,
          chosenPhaseId: candidatePhaseId,
          expectedNextPhaseId,
          rejectedTransitionReason,
          repPromotionReason,
          confidenceGateOpen: state.confidenceGateOpen,
          perPhaseScores: frameSample.perPhaseScores ?? {},
          expectedPhaseIndex,
          expectedPhaseId: sequenceExpectedPhaseId,
          matchedSequenceProgress: `${state.repProgress.expectedSequenceIndex}/${Math.max(0, (state.runtimeModel?.loopPhaseIds.length ?? 1) - 1)}`,
          repCount: state.repProgress.repCount
        });
      }
      const latestCapture = state.captures[state.captures.length - 1];
      if (latestCapture?.frameSample.scoringDebug) {
        latestCapture.frameSample.scoringDebug.liveDecision = {
          currentPhaseId: state.currentPhaseId,
          rawDetectedPhaseId: frameSample.classifiedPhaseId ?? null,
          candidatePhaseId: runtimeCandidatePhaseId,
          chosenPhaseId: candidatePhaseId,
          expectedNextPhaseId,
          confidenceGateOpen: state.confidenceGateOpen,
          armDeltaCurrent: state.currentPhaseId ? averageArmDelta(frameSample.scoringDebug?.phaseComparisons ?? {}, state.currentPhaseId) : null,
          armDeltaExpected: expectedNextPhaseId ? averageArmDelta(frameSample.scoringDebug?.phaseComparisons ?? {}, expectedNextPhaseId) : null,
          promotionReason: repPromotionReason,
          rejectionReason: rejectedTransitionReason
        };
      }
      if (candidatePhaseId === state.currentPhaseId || candidatePhaseId === null) {
        if (candidatePhaseId === null && state.currentPhaseId === state.runtimeModel?.holdPhaseId && state.activeHoldStartMs !== null) {
          const rejectReason = frameSample.confidence < PHASE_CONFIDENCE_GATE_EXIT ? "low_confidence" : "match_rejected";
          closeActiveHold(frame.timestampMs, { exitReason: rejectReason, qualified: true });
        }
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
        closeActiveHold(endMs, { inferredSessionEnd: true, exitReason: "session_end" });
      }

      const normalized = normalizeTraceToVideoDuration(state.captures, state.events, video.durationMs);
      const holdDurationMs = Math.min(video.durationMs, getHoldDurationMsAtTimestamp(video.durationMs));

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
          holdDurationMs,
          partialAttemptCount: state.partialAttemptCount,
          invalidTransitionCount: state.invalidTransitionCount,
          analyzedDurationMs: video.durationMs,
          confidenceAvg: state.confidenceCount ? state.confidenceTotal / state.confidenceCount : 0,
          lowConfidenceFrames: state.lowConfidenceFrames
        }
      };
    },

    getHoldDurationMsAtTimestamp(timestampMs: number): number {
      return getHoldDurationMsAtTimestamp(timestampMs);
    }
  };
}
