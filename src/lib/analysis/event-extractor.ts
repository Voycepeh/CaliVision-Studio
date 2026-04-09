import type { AnalysisEvent, AnalysisSession, PortableDrill, PortableDrillAnalysis } from "../schema/contracts.ts";
import { buildPhaseRuntimeModel, type PhaseRuntimeModel } from "./phase-runtime.ts";
import type { SmoothedPhaseFrame, SmootherTransition } from "./types.ts";

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

  let repCount = 0;
  let partialAttemptCount = 0;
  let expectedIndex = 0;
  let cycleStartMs: number | null = null;
  let lastRepMs = -Number.MAX_SAFE_INTEGER;

  for (const transition of transitions) {
    if (transition.type !== "phase_enter" || !transition.phaseId) {
      continue;
    }

    const entered = transition.phaseId;
    const exactExpected = sequence[expectedIndex];
    const enteredIndex = sequence.indexOf(entered);
    if (enteredIndex < 0) {
      continue;
    }

    if (entered === exactExpected) {
      if (expectedIndex === 0) {
        cycleStartMs = transition.timestampMs;
      }
      expectedIndex += 1;

      if (expectedIndex >= sequence.length) {
        const repDurationMs = cycleStartMs === null ? 0 : transition.timestampMs - cycleStartMs;
        const passesMinDuration = repDurationMs >= analysis.minimumRepDurationMs;
        const outsideCooldown = transition.timestampMs - lastRepMs >= analysis.cooldownMs;
        if (passesMinDuration && outsideCooldown) {
          repCount += 1;
          lastRepMs = transition.timestampMs;
          addEvent({
            timestampMs: transition.timestampMs,
            type: "rep_complete",
            repIndex: repCount,
            details: { repDurationMs }
          });
        } else {
          partialAttemptCount += 1;
          addEvent({
            timestampMs: transition.timestampMs,
            type: "partial_attempt",
            details: {
              repDurationMs,
              reason: !passesMinDuration ? "below_minimum_rep_duration" : "cooldown_active"
            }
          });
        }

        expectedIndex = 0;
        cycleStartMs = null;
      }
      continue;
    }

    if (enteredIndex === 0) {
      expectedIndex = 1;
      cycleStartMs = transition.timestampMs;
      continue;
    }

    if (enteredIndex > expectedIndex) {
      expectedIndex = enteredIndex + 1;
      continue;
    }

    if (expectedIndex > 0) {
      partialAttemptCount += 1;
      addEvent({
        timestampMs: transition.timestampMs,
        type: "partial_attempt",
        details: { reason: "sequence_reset" }
      });
    }
    expectedIndex = 0;
    cycleStartMs = null;
  }

  return { repCount, partialAttemptCount };
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
