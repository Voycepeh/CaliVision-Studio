import type { AnalysisEvent, PortableDrill } from "../schema/contracts.ts";
import { normalizeDrillBenchmark } from "../drills/benchmark.ts";

export type PhaseRule = {
  phaseId: string;
  label: string;
  order: number;
  required: boolean;
  durationRelevant: boolean;
  holdRequired: boolean;
  minHoldDurationMs?: number;
  targetHoldDurationMs?: number;
  criteriaHooks: string[];
};

export type DrillReferenceCriteria = {
  phaseOrder: string[];
  phaseRules: Record<string, PhaseRule>;
};

export type CompositeRepState = {
  completedReps: number;
  currentRepPhaseOrder: string[];
  requiredPhaseStatus: Record<string, boolean>;
  holdStatusByPhase: Record<string, { required: boolean; satisfied: boolean; elapsedMs: number }>;
};

function toPositiveMs(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function buildDrillReferenceCriteria(drill: PortableDrill): DrillReferenceCriteria {
  const benchmark = normalizeDrillBenchmark(drill.benchmark);
  const authoredOrder = [...drill.phases].sort((a, b) => a.order - b.order).map((phase) => phase.phaseId);
  const phaseOrder = authoredOrder.length > 0
    ? authoredOrder
    : (benchmark?.phaseSequence ?? []).map((phase) => phase.key);

  const benchmarkTiming = benchmark?.timing?.phaseDurationsMs ?? {};
  const phaseRules = Object.fromEntries(
    [...drill.phases]
      .sort((a, b) => a.order - b.order)
      .map((phase, index) => {
        const comparison = phase.analysis?.comparison;
        const legacyDuration = toPositiveMs(benchmarkTiming[phase.phaseId]);
        const minHoldDurationMs = toPositiveMs(comparison?.minHoldDurationMs) ?? (comparison?.holdRequired ? legacyDuration : undefined);
        const targetHoldDurationMs = toPositiveMs(comparison?.targetHoldDurationMs) ?? legacyDuration;
        const holdRequired = Boolean(comparison?.holdRequired) || (typeof minHoldDurationMs === "number" && minHoldDurationMs > 0);

        const rule: PhaseRule = {
          phaseId: phase.phaseId,
          label: phase.name,
          order: index + 1,
          required: comparison?.required !== false,
          durationRelevant: Boolean(comparison?.durationRelevant || holdRequired || typeof targetHoldDurationMs === "number"),
          holdRequired,
          minHoldDurationMs,
          targetHoldDurationMs,
          criteriaHooks: comparison?.criteriaHooks ?? []
        };

        return [phase.phaseId, rule] as const;
      })
  );

  return {
    phaseOrder,
    phaseRules
  };
}

function calculateHoldDurations(events: AnalysisEvent[]): Record<string, number[]> {
  const holdStarts = new Map<string, number>();
  const durationsByPhase: Record<string, number[]> = {};
  for (const event of [...events].sort((a, b) => a.timestampMs - b.timestampMs)) {
    if (!event.phaseId) continue;
    if (event.type === "hold_start") {
      holdStarts.set(event.phaseId, event.timestampMs);
      continue;
    }
    if (event.type !== "hold_end") {
      continue;
    }
    const start = holdStarts.get(event.phaseId);
    const explicitDuration = toPositiveMs(event.details?.durationMs ?? event.details?.holdDurationMs);
    const duration = explicitDuration ?? (typeof start === "number" ? Math.max(0, event.timestampMs - start) : undefined);
    if (!duration || duration <= 0) continue;
    durationsByPhase[event.phaseId] = durationsByPhase[event.phaseId] ?? [];
    durationsByPhase[event.phaseId].push(duration);
    holdStarts.delete(event.phaseId);
  }
  return durationsByPhase;
}

export function isPhaseRuleSatisfied(input: {
  rule: PhaseRule;
  reached: boolean;
  holdDurationsMs?: number[];
}): boolean {
  if (!input.rule.required) {
    return true;
  }
  if (!input.reached) {
    return false;
  }
  if (!input.rule.holdRequired) {
    return true;
  }
  const durations = input.holdDurationsMs ?? [];
  const peak = durations.length > 0 ? Math.max(...durations) : 0;
  const minimum = input.rule.minHoldDurationMs ?? 0;
  return peak >= minimum;
}

export function isRepSatisfiedAtTimestamp(input: {
  criteria: DrillReferenceCriteria;
  events: AnalysisEvent[];
  timestampMs: number;
}): boolean {
  const state = buildCompositeRepState(input.criteria, input.events, input.timestampMs);
  const requiredComplete = Object.values(state.requiredPhaseStatus).every(Boolean);
  const requiredHoldsComplete = Object.values(state.holdStatusByPhase)
    .filter((entry) => entry.required)
    .every((entry) => entry.satisfied);
  return requiredComplete && requiredHoldsComplete;
}

export function buildCompositeRepState(criteria: DrillReferenceCriteria, events: AnalysisEvent[], timestampMs: number): CompositeRepState {
  const ordered = [...events]
    .filter((event) => event.timestampMs <= timestampMs)
    .sort((a, b) => a.timestampMs - b.timestampMs);
  const phaseSequence = ordered
    .filter((event) => event.type === "phase_enter" && Boolean(event.phaseId))
    .map((event) => event.phaseId as string)
    .filter((phaseId, index, arr) => index === 0 || arr[index - 1] !== phaseId);
  const holdDurations = calculateHoldDurations(ordered);

  const expectedSequence = criteria.phaseOrder;
  const completedCycles = getCompletedRepsSoFar({ expectedSequence, actualPhaseSequence: phaseSequence });
  const consumedPhaseCount = completedCycles * expectedSequence.length;
  const currentRepPhaseOrder = phaseSequence.slice(consumedPhaseCount);

  const requiredPhaseStatus: Record<string, boolean> = {};
  const holdStatusByPhase: CompositeRepState["holdStatusByPhase"] = {};

  for (const phaseId of expectedSequence) {
    const rule = criteria.phaseRules[phaseId];
    if (!rule) {
      continue;
    }
    const reached = currentRepPhaseOrder.includes(phaseId) || completedCycles > 0;
    requiredPhaseStatus[phaseId] = isPhaseRuleSatisfied({
      rule: { ...rule, holdRequired: false },
      reached
    });
    holdStatusByPhase[phaseId] = {
      required: rule.holdRequired,
      satisfied: isPhaseRuleSatisfied({ rule, reached, holdDurationsMs: holdDurations[phaseId] }),
      elapsedMs: holdDurations[phaseId]?.length ? Math.max(...holdDurations[phaseId]) : 0
    };
  }

  return {
    completedReps: completedCycles,
    currentRepPhaseOrder,
    requiredPhaseStatus,
    holdStatusByPhase
  };
}

export function getCompletedRepsSoFar(input: { expectedSequence: string[]; actualPhaseSequence: string[] }): number {
  const expected = input.expectedSequence.filter(Boolean);
  if (expected.length === 0) {
    return 0;
  }
  const actual = input.actualPhaseSequence.filter(Boolean);
  let index = 0;
  let completed = 0;
  while (index + expected.length <= actual.length) {
    const window = actual.slice(index, index + expected.length);
    if (window.every((phaseId, phaseIndex) => phaseId === expected[phaseIndex])) {
      completed += 1;
      index += expected.length;
      continue;
    }
    index += 1;
  }
  return completed;
}
