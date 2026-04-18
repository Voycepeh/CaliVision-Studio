import type { AnalysisSessionRecord } from "./session-repository.ts";
import type { PortableDrill } from "../schema/contracts.ts";

export type PhaseRule = {
  phaseId: string;
  required: boolean;
  durationMatters: boolean;
  isHoldPhase: boolean;
  minHoldDurationMs?: number;
  targetHoldDurationMs?: number;
};

export type CompositeRepState = {
  sequence: string[];
  requiredPhaseIds: string[];
  rulesByPhaseId: Record<string, PhaseRule>;
};

export function buildCompositeRepState(drill: PortableDrill): CompositeRepState {
  const orderedPhases = [...drill.phases].sort((a, b) => a.order - b.order);
  const sequence = orderedPhases.map((phase) => phase.phaseId);
  const rules = orderedPhases.map((phase) => {
    const comparison = phase.analysis?.comparison;
    const minHoldDurationMs = typeof comparison?.minHoldDurationMs === "number"
      ? Math.max(0, comparison.minHoldDurationMs)
      : undefined;
    const targetHoldDurationMs = typeof comparison?.targetHoldDurationMs === "number"
      ? Math.max(0, comparison.targetHoldDurationMs)
      : undefined;
    const isHoldPhase = comparison?.isHoldPhase
      ?? Boolean(minHoldDurationMs && minHoldDurationMs > 0)
      ?? phase.analysis?.semanticRole === "hold";

    return {
      phaseId: phase.phaseId,
      required: comparison?.required ?? true,
      durationMatters: comparison?.durationMatters
        ?? Boolean(isHoldPhase || (typeof minHoldDurationMs === "number" && minHoldDurationMs > 0)),
      isHoldPhase,
      minHoldDurationMs,
      targetHoldDurationMs
    } satisfies PhaseRule;
  });

  return {
    sequence,
    requiredPhaseIds: rules.filter((rule) => rule.required).map((rule) => rule.phaseId),
    rulesByPhaseId: Object.fromEntries(rules.map((rule) => [rule.phaseId, rule]))
  };
}

export function isPhaseRuleSatisfied(input: { phaseId: string; observedDurationMs?: number | null; rule: PhaseRule | undefined }): boolean {
  const { rule } = input;
  if (!rule) {
    return true;
  }
  if (!rule.required) {
    return true;
  }
  if (!rule.durationMatters || !rule.isHoldPhase) {
    return true;
  }
  const observedDurationMs = Math.max(0, Number(input.observedDurationMs ?? 0));
  const minimum = Math.max(0, Number(rule.minHoldDurationMs ?? 0));
  return observedDurationMs >= minimum;
}

export function isRepSatisfiedAtTimestamp(input: {
  repState: CompositeRepState;
  enteredPhaseIds: string[];
  holdDurationByPhaseId: Record<string, number>;
}): boolean {
  const { repState, enteredPhaseIds, holdDurationByPhaseId } = input;

  const expected = repState.sequence;
  if (expected.length < 2) {
    return false;
  }

  let matchIndex = 0;
  for (const phaseId of enteredPhaseIds) {
    if (phaseId === expected[matchIndex]) {
      matchIndex += 1;
      if (matchIndex >= expected.length) {
        break;
      }
    }
  }
  if (matchIndex < expected.length) {
    return false;
  }

  for (const requiredPhaseId of repState.requiredPhaseIds) {
    if (!enteredPhaseIds.includes(requiredPhaseId)) {
      return false;
    }
  }

  return Object.values(repState.rulesByPhaseId).every((rule) =>
    isPhaseRuleSatisfied({
      phaseId: rule.phaseId,
      observedDurationMs: holdDurationByPhaseId[rule.phaseId],
      rule
    })
  );
}

export function getCompletedRepsSoFar(input: {
  repState: CompositeRepState;
  session: AnalysisSessionRecord | null | undefined;
  timestampMs: number;
}): number {
  const session = input.session;
  if (!session) {
    return 0;
  }
  const clamped = Math.max(0, Number.isFinite(input.timestampMs) ? input.timestampMs : 0);
  return session.events.filter((event) => event.type === "rep_complete" && event.timestampMs <= clamped).length;
}
