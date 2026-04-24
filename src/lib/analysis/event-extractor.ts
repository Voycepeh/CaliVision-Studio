import type { AnalysisEvent, AnalysisSession, PortableDrill, PortableDrillAnalysis } from "../schema/contracts.ts";
import { buildPhaseRuntimeModel, type PhaseRuntimeModel } from "./phase-runtime.ts";
import type { SmoothedPhaseFrame, SmootherTransition } from "./types.ts";
import { advanceRepSequence, createRepSequenceProgress } from "./rep-sequence-engine.ts";

export function extractAnalysisEvents(
  drill: PortableDrill,
  smoothedFrames: SmoothedPhaseFrame[],
  transitions: SmootherTransition[],
  runtimeModel?: PhaseRuntimeModel,
  options?: { maxTimestampMs?: number }
): { events: AnalysisEvent[]; summary: AnalysisSession["summary"] } {
  const analysis = drill.analysis;
  if (!analysis) {
    return { events: [], summary: {} };
  }
  const resolvedRuntimeModel = runtimeModel ?? buildPhaseRuntimeModel(drill, analysis);

  const events: AnalysisEvent[] = [];
  const addEvent = (event: Omit<AnalysisEvent, "eventId">) => {
    events.push({ ...event, eventId: `evt_${events.length + 1}` });
  };

  for (const transition of transitions) {
    addEvent({
      timestampMs: transition.timestampMs,
      type: transition.type,
      phaseId: transition.phaseId,
      fromPhaseId: transition.fromPhaseId,
      toPhaseId: transition.toPhaseId,
      details: transition.details
    });
  }

  const repSummary = extractRepEvents(resolvedRuntimeModel, analysis, transitions, addEvent);
  const holdSummary = extractHoldEvents(analysis, resolvedRuntimeModel, transitions, smoothedFrames, addEvent, options);
  const invalidTransitionCount = transitions.filter((item) => item.type === "invalid_transition").length;

  return {
    events,
    summary: {
      repCount: repSummary.repCount,
      holdDurationMs: holdSummary.totalQualifiedHoldDurationMs,
      partialAttemptCount: repSummary.partialAttemptCount,
      invalidTransitionCount
    }
  };
}

function extractRepEvents(
  runtimeModel: PhaseRuntimeModel,
  analysis: PortableDrillAnalysis,
  transitions: SmootherTransition[],
  addEvent: (event: Omit<AnalysisEvent, "eventId">) => void
): { repCount: number; partialAttemptCount: number } {
  if (runtimeModel.measurementMode === "hold") {
    return { repCount: 0, partialAttemptCount: 0 };
  }

  if (runtimeModel.phaseCount < runtimeModel.repRequiresAtLeastPhaseCount) {
    addEvent({
      timestampMs: transitions.at(-1)?.timestampMs ?? 0,
      type: "partial_attempt",
      details: { reason: "insufficient_phase_count_for_rep" }
    });
    return { repCount: 0, partialAttemptCount: 1 };
  }

  const sequence = runtimeModel.loopPhaseIds;
  if (sequence.length < 2) {
    return { repCount: 0, partialAttemptCount: 0 };
  }

  const progress = createRepSequenceProgress();
  const minimumRepDurationMs = Math.max(0, analysis.minimumRepDurationMs ?? 0);
  const cooldownMs = Math.max(0, analysis.cooldownMs ?? 0);
  const legacyMetadataIgnored = runtimeModel.legacyOrderMismatch;

  for (const transition of transitions) {
    if (transition.type !== "phase_enter" || !transition.phaseId) {
      continue;
    }

    const step = advanceRepSequence({
      sequence,
      event: { timestampMs: transition.timestampMs, phaseId: transition.phaseId },
      progress,
      minimumRepDurationMs,
      cooldownMs,
      allowForwardJump: Boolean(
        transition.fromPhaseId
          && runtimeModel.allowedTransitionKeys.has(`${transition.fromPhaseId}->${transition.phaseId}`)
      )
    });

    if (step.kind === "rep_complete") {
      addEvent({
        timestampMs: transition.timestampMs,
        type: "rep_complete",
        repIndex: step.progress.repCount,
        details: {
          ...step.details,
          minRepDurationMs: minimumRepDurationMs,
          legacyMetadataIgnored
        }
      });
      continue;
    }

    if (step.kind === "partial_attempt") {
      const expectedPhaseLabel = typeof step.details.expectedPhaseId === "string"
        ? runtimeModel.phaseLabelById[step.details.expectedPhaseId] ?? step.details.expectedPhaseId
        : null;
      const resumedAtPhaseLabel = typeof step.details.resumedAtPhaseId === "string"
        ? runtimeModel.phaseLabelById[step.details.resumedAtPhaseId] ?? step.details.resumedAtPhaseId
        : null;
      addEvent({
        timestampMs: transition.timestampMs,
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
    }
  }

  return { repCount: progress.repCount, partialAttemptCount: progress.partialAttemptCount };
}

function extractHoldEvents(
  analysis: PortableDrillAnalysis,
  runtimeModel: PhaseRuntimeModel,
  transitions: SmootherTransition[],
  smoothedFrames: SmoothedPhaseFrame[],
  addEvent: (event: Omit<AnalysisEvent, "eventId">) => void,
  options?: { maxTimestampMs?: number }
): { totalQualifiedHoldDurationMs: number } {
  if (runtimeModel.measurementMode !== "hold") {
    return { totalQualifiedHoldDurationMs: 0 };
  }

  const targetPhaseId = runtimeModel.holdPhaseId ?? analysis.targetHoldPhaseId;
  if (!targetPhaseId) {
    return { totalQualifiedHoldDurationMs: 0 };
  }
  const fallbackMaxTimestampMs = Math.max(
    0,
    smoothedFrames[smoothedFrames.length - 1]?.timestampMs ?? 0,
    transitions[transitions.length - 1]?.timestampMs ?? 0
  );
  const maxTimestampMs = Number.isFinite(options?.maxTimestampMs)
    ? Math.max(0, Math.round(options?.maxTimestampMs ?? 0))
    : fallbackMaxTimestampMs;

  let activeHoldStartMs: number | null = null;
  let totalQualifiedHoldDurationMs = 0;
  const minHoldDurationMs = Math.max(0, analysis.minimumHoldDurationMs ?? 0);
  const clampTimestamp = (value: number): { value: number; clamped: boolean } => {
    const safe = Math.max(0, Math.round(value));
    const clamped = Math.min(maxTimestampMs, safe);
    return { value: clamped, clamped: clamped !== safe };
  };
  const closeHold = (
    endTimestampMs: number,
    exitReason: "phase_exit" | "phase_replaced" | "match_rejected" | "low_confidence" | "session_end"
  ) => {
    if (activeHoldStartMs === null) {
      return;
    }
    const startRaw = Math.max(0, Math.round(activeHoldStartMs));
    const endRaw = Math.max(startRaw, Math.round(endTimestampMs));
    const clampedStart = clampTimestamp(startRaw);
    const clampedEnd = clampTimestamp(endRaw);
    const rawDurationMs = Math.max(0, endRaw - startRaw);
    const durationMs = Math.max(0, clampedEnd.value - clampedStart.value);
    const clamped = clampedStart.clamped || clampedEnd.clamped || rawDurationMs !== durationMs;
    const qualified = durationMs >= minHoldDurationMs;
    if (qualified) {
      totalQualifiedHoldDurationMs += durationMs;
    }
    addEvent({
      timestampMs: clampedEnd.value,
      type: "hold_end",
      phaseId: targetPhaseId,
      details: {
        durationMs,
        qualified,
        exitReason,
        clamped,
        ...(clamped ? { rawDurationMs } : {})
      }
    });
    activeHoldStartMs = null;
  };

  const firstFrame = smoothedFrames[0];
  const hasExplicitStartAtOrBeforeFirstFrame = firstFrame
    ? transitions.some(
      (transition) => transition.type === "phase_enter"
        && transition.phaseId === targetPhaseId
        && transition.timestampMs <= firstFrame.timestampMs
    )
    : false;

  if (
    firstFrame
    && firstFrame.smoothedPhaseId === targetPhaseId
    && !hasExplicitStartAtOrBeforeFirstFrame
  ) {
    activeHoldStartMs = clampTimestamp(firstFrame.timestampMs).value;
    addEvent({
      timestampMs: activeHoldStartMs,
      type: "hold_start",
      phaseId: targetPhaseId,
      details: { inferredSessionStart: true }
    });
  }

  for (const transition of transitions) {
    if (transition.type === "phase_enter" && transition.phaseId === targetPhaseId) {
      if (activeHoldStartMs === null) {
        activeHoldStartMs = clampTimestamp(transition.timestampMs).value;
        addEvent({ timestampMs: activeHoldStartMs, type: "hold_start", phaseId: targetPhaseId });
      }
      continue;
    }

    if (activeHoldStartMs !== null && transition.type === "phase_exit" && transition.phaseId === targetPhaseId) {
      const transitionReason = transition.details?.reason;
      closeHold(
        transition.timestampMs,
        transitionReason === "low_confidence"
          ? "low_confidence"
          : transitionReason === "match_rejected"
            ? "match_rejected"
            : "phase_exit"
      );
      continue;
    }

    if (activeHoldStartMs !== null && transition.type === "phase_enter" && transition.phaseId && transition.phaseId !== targetPhaseId) {
      closeHold(transition.timestampMs, "phase_replaced");
    }
  }

  if (activeHoldStartMs !== null && smoothedFrames.length > 0) {
    const finalObservedPhaseId = smoothedFrames[smoothedFrames.length - 1].smoothedPhaseId ?? null;
    if (finalObservedPhaseId === targetPhaseId) {
      closeHold(smoothedFrames[smoothedFrames.length - 1].timestampMs, "session_end");
    }
  }

  return { totalQualifiedHoldDurationMs: Math.max(0, Math.min(maxTimestampMs, totalQualifiedHoldDurationMs)) };
}
