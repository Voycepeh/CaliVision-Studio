import type { AnalysisEvent, AnalysisSession, PortableDrill, PortableDrillAnalysis } from "../schema/contracts.ts";
import { buildPhaseRuntimeModel, type PhaseRuntimeModel } from "./phase-runtime.ts";
import type { SmoothedPhaseFrame, SmootherTransition } from "./types.ts";
import { advanceRepSequence, createRepSequenceProgress } from "./rep-sequence-engine.ts";

export function extractAnalysisEvents(
  drill: PortableDrill,
  smoothedFrames: SmoothedPhaseFrame[],
  transitions: SmootherTransition[],
  runtimeModel?: PhaseRuntimeModel
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
  const holdSummary = extractHoldEvents(analysis, resolvedRuntimeModel, transitions, smoothedFrames, addEvent);
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
  if (analysis.measurementType === "hold") {
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
      addEvent({
        timestampMs: transition.timestampMs,
        type: "partial_attempt",
        details: {
          ...step.details,
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
  addEvent: (event: Omit<AnalysisEvent, "eventId">) => void
): { totalQualifiedHoldDurationMs: number } {
  if (analysis.measurementType === "rep") {
    return { totalQualifiedHoldDurationMs: 0 };
  }

  const targetPhaseId = runtimeModel.holdPhaseId ?? analysis.targetHoldPhaseId;
  if (!targetPhaseId) {
    return { totalQualifiedHoldDurationMs: 0 };
  }

  let activeHoldStartMs: number | null = null;
  let totalQualifiedHoldDurationMs = 0;

  for (const transition of transitions) {
    if (transition.type === "phase_enter" && transition.phaseId === targetPhaseId) {
      if (activeHoldStartMs === null) {
        activeHoldStartMs = transition.timestampMs;
        addEvent({ timestampMs: transition.timestampMs, type: "hold_start", phaseId: targetPhaseId });
      }
      continue;
    }

    if (transition.type === "phase_exit" && transition.phaseId === targetPhaseId && activeHoldStartMs !== null) {
      const durationMs = transition.timestampMs - activeHoldStartMs;
      const qualified = durationMs >= analysis.minimumHoldDurationMs;
      if (qualified) {
        totalQualifiedHoldDurationMs += durationMs;
      }
      addEvent({
        timestampMs: transition.timestampMs,
        type: "hold_end",
        phaseId: targetPhaseId,
        details: { durationMs, qualified }
      });
      activeHoldStartMs = null;
    }
  }

  if (activeHoldStartMs !== null && smoothedFrames.length > 0) {
    const endTs = smoothedFrames[smoothedFrames.length - 1].timestampMs;
    const durationMs = endTs - activeHoldStartMs;
    const qualified = durationMs >= analysis.minimumHoldDurationMs;
    if (qualified) {
      totalQualifiedHoldDurationMs += durationMs;
    }
    addEvent({
      timestampMs: endTs,
      type: "hold_end",
      phaseId: targetPhaseId,
      details: { durationMs, qualified, inferredSessionEnd: true }
    });
  }

  return { totalQualifiedHoldDurationMs };
}
