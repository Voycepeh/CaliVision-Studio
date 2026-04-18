import type { AnalysisEvent, PortableDrill } from "../schema/contracts.ts";
import type { AnalysisSessionRecord } from "./session-repository.ts";
import { normalizeDrillBenchmark } from "../drills/benchmark.ts";

const DEFAULT_TIMING_TOLERANCE_RATIO = 0.2;
const DEFAULT_TIMING_TOLERANCE_MIN_MS = 120;

export type BenchmarkComparisonStatus =
  | "matched"
  | "partial"
  | "missing_benchmark"
  | "phase_mismatch"
  | "timing_mismatch"
  | "insufficient_attempt_data";

export type BenchmarkQualityBucket = "good" | "fair" | "poor" | "unknown";

export type BenchmarkPhaseMatch = {
  expectedPhaseKeys: string[];
  actualPhaseKeys: string[];
  matched: boolean;
  matchedCount: number;
  missingPhases: string[];
  extraPhases: string[];
};

export type BenchmarkTimingComparison = {
  present: boolean;
  matched: boolean | null;
  expectedRepDurationMs?: number;
  actualRepDurationMs?: number;
  expectedHoldDurationMs?: number;
  actualHoldDurationMs?: number;
  phaseTimingCompared: Array<{
    phaseKey: string;
    expectedDurationMs: number;
    actualDurationMs: number;
    withinTolerance: boolean;
    toleranceMs: number;
  }>;
};

export type BenchmarkComparisonResult = {
  status: BenchmarkComparisonStatus;
  benchmarkPresent: boolean;
  movementType: "rep" | "hold";
  phaseMatch: BenchmarkPhaseMatch;
  timing: BenchmarkTimingComparison;
  quality: {
    bucket: BenchmarkQualityBucket;
    scoreBucket: "high" | "medium" | "low" | "unknown";
    flags: string[];
  };
  reasons: string[];
};

type AttemptRuntime = {
  phaseKeys: string[];
  phaseDurationsMs: Record<string, number>;
  analyzedDurationMs: number;
  repDurationMs: number | null;
  holdDurationMs: number | null;
};

export function compareAttemptToBenchmark(input: {
  drill: PortableDrill;
  session: Pick<AnalysisSessionRecord, "events" | "summary" | "frameSamples" | "status">;
}): BenchmarkComparisonResult {
  const benchmark = normalizeDrillBenchmark(input.drill.benchmark);
  const rawMovementType = benchmark?.movementType ?? input.drill.analysis?.measurementType ?? input.drill.drillType;
  const movementType: "rep" | "hold" = rawMovementType === "hold" ? "hold" : "rep";

  if (!benchmark || benchmark.sourceType === "none") {
    return createBaseResult("missing_benchmark", movementType, {
      benchmarkPresent: false,
      reasons: ["Drill has no benchmark metadata available."]
    });
  }

  const attempt = deriveAttemptRuntime(input.session.events, input.session.summary);
  const hasAttemptData = input.session.frameSamples.length > 0 && attempt.analyzedDurationMs > 0;
  if (!hasAttemptData) {
    return createBaseResult("insufficient_attempt_data", movementType, {
      benchmarkPresent: true,
      reasons: ["Attempt did not include enough analyzed frames/timing to compare."],
      phaseMatch: compareAttemptPhasesToBenchmark(attempt.phaseKeys, benchmark.phaseSequence?.map((phase) => phase.key) ?? [])
    });
  }

  if (movementType === "hold") {
    return compareHoldAttemptToBenchmark({ attempt, benchmarkPhaseKeys: benchmark.phaseSequence?.map((phase) => phase.key) ?? [], benchmarkTiming: benchmark.timing });
  }

  return compareRepAttemptToBenchmark({ attempt, benchmarkPhaseKeys: benchmark.phaseSequence?.map((phase) => phase.key) ?? [], benchmarkTiming: benchmark.timing });
}

export function compareRepAttemptToBenchmark(input: {
  attempt: AttemptRuntime;
  benchmarkPhaseKeys: string[];
  benchmarkTiming?: { expectedRepDurationMs?: number; phaseDurationsMs?: Record<string, number> };
}): BenchmarkComparisonResult {
  const phaseMatch = compareAttemptPhasesToBenchmark(input.attempt.phaseKeys, input.benchmarkPhaseKeys);
  const timing = compareAttemptTimingToBenchmark({
    movementType: "rep",
    phaseDurationsMs: input.attempt.phaseDurationsMs,
    actualRepDurationMs: input.attempt.repDurationMs ?? input.attempt.analyzedDurationMs,
    benchmarkTiming: input.benchmarkTiming
  });

  const reasons: string[] = [];
  if (!phaseMatch.matched) {
    reasons.push("Attempt phase sequence differs from benchmark phase sequence.");
  }
  if (timing.present && timing.matched === false) {
    reasons.push("Attempt rep timing falls outside benchmark tolerance.");
  }

  const status = resolveStatus({ phaseMatched: phaseMatch.matched, timingMatched: timing.matched, timingPresent: timing.present });
  return buildResult(status, "rep", phaseMatch, timing, reasons);
}

export function compareHoldAttemptToBenchmark(input: {
  attempt: AttemptRuntime;
  benchmarkPhaseKeys: string[];
  benchmarkTiming?: { targetHoldDurationMs?: number; phaseDurationsMs?: Record<string, number> };
}): BenchmarkComparisonResult {
  const phaseMatch = compareAttemptPhasesToBenchmark(input.attempt.phaseKeys, input.benchmarkPhaseKeys);
  const timing = compareAttemptTimingToBenchmark({
    movementType: "hold",
    phaseDurationsMs: input.attempt.phaseDurationsMs,
    actualHoldDurationMs: input.attempt.holdDurationMs ?? input.attempt.analyzedDurationMs,
    benchmarkTiming: input.benchmarkTiming
  });

  const reasons: string[] = [];
  if (!phaseMatch.matched) {
    reasons.push("Attempt hold phase sequence differs from benchmark phase sequence.");
  }
  if (timing.present && timing.matched === false) {
    reasons.push("Attempt hold timing falls outside benchmark tolerance.");
  }

  const status = resolveStatus({ phaseMatched: phaseMatch.matched, timingMatched: timing.matched, timingPresent: timing.present });
  return buildResult(status, "hold", phaseMatch, timing, reasons);
}

export function compareAttemptPhasesToBenchmark(actualPhaseKeys: string[], expectedPhaseKeys: string[]): BenchmarkPhaseMatch {
  const normalizedActual = actualPhaseKeys.filter(Boolean);
  const normalizedExpected = expectedPhaseKeys.filter(Boolean);
  const comparedCount = Math.min(normalizedActual.length, normalizedExpected.length);
  let matchedCount = 0;

  for (let index = 0; index < comparedCount; index += 1) {
    if (normalizedActual[index] === normalizedExpected[index]) {
      matchedCount += 1;
    }
  }

  const expectedSet = new Set(normalizedExpected);
  const actualSet = new Set(normalizedActual);

  return {
    expectedPhaseKeys: normalizedExpected,
    actualPhaseKeys: normalizedActual,
    matched: normalizedActual.length === normalizedExpected.length && matchedCount === normalizedExpected.length,
    matchedCount,
    missingPhases: normalizedExpected.filter((phaseKey) => !actualSet.has(phaseKey)),
    extraPhases: normalizedActual.filter((phaseKey) => !expectedSet.has(phaseKey))
  };
}

export function compareAttemptTimingToBenchmark(input: {
  movementType: "rep" | "hold";
  phaseDurationsMs: Record<string, number>;
  actualRepDurationMs?: number;
  actualHoldDurationMs?: number;
  benchmarkTiming?: { expectedRepDurationMs?: number; targetHoldDurationMs?: number; phaseDurationsMs?: Record<string, number> };
}): BenchmarkTimingComparison {
  const phaseTimingCompared = Object.entries(input.benchmarkTiming?.phaseDurationsMs ?? {}).flatMap(([phaseKey, expectedDurationMs]) => {
    const actualDurationMs = input.phaseDurationsMs[phaseKey];
    if (!(expectedDurationMs > 0) || !(actualDurationMs > 0)) {
      return [];
    }

    const toleranceMs = Math.max(DEFAULT_TIMING_TOLERANCE_MIN_MS, expectedDurationMs * DEFAULT_TIMING_TOLERANCE_RATIO);
    return [{
      phaseKey,
      expectedDurationMs,
      actualDurationMs,
      toleranceMs,
      withinTolerance: Math.abs(actualDurationMs - expectedDurationMs) <= toleranceMs
    }];
  });

  const expectedAggregateMs = input.movementType === "rep"
    ? input.benchmarkTiming?.expectedRepDurationMs
    : input.benchmarkTiming?.targetHoldDurationMs;
  const actualAggregateMs = input.movementType === "rep" ? input.actualRepDurationMs : input.actualHoldDurationMs;

  const hasAggregate = typeof expectedAggregateMs === "number" && expectedAggregateMs > 0 && typeof actualAggregateMs === "number" && actualAggregateMs > 0;
  const aggregateWithinTolerance = hasAggregate
    ? Math.abs((actualAggregateMs as number) - (expectedAggregateMs as number))
      <= Math.max(DEFAULT_TIMING_TOLERANCE_MIN_MS, (expectedAggregateMs as number) * DEFAULT_TIMING_TOLERANCE_RATIO)
    : null;

  const hasPhaseTiming = phaseTimingCompared.length > 0;
  const phaseTimingMatched = hasPhaseTiming ? phaseTimingCompared.every((entry) => entry.withinTolerance) : null;
  const present = hasAggregate || hasPhaseTiming;
  const matched = present
    ? [aggregateWithinTolerance, phaseTimingMatched].filter((value): value is boolean => value !== null).every(Boolean)
    : null;

  return {
    present,
    matched,
    expectedRepDurationMs: input.movementType === "rep" ? expectedAggregateMs : undefined,
    actualRepDurationMs: input.movementType === "rep" ? actualAggregateMs : undefined,
    expectedHoldDurationMs: input.movementType === "hold" ? expectedAggregateMs : undefined,
    actualHoldDurationMs: input.movementType === "hold" ? actualAggregateMs : undefined,
    phaseTimingCompared
  };
}

function deriveAttemptRuntime(events: AnalysisEvent[], summary: AnalysisSessionRecord["summary"]): AttemptRuntime {
  const orderedPhaseEvents = [...events]
    .filter((event) => event.type === "phase_enter" && event.phaseId)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const phaseKeys: string[] = [];
  const phaseDurationsMs: Record<string, number> = {};

  for (let index = 0; index < orderedPhaseEvents.length; index += 1) {
    const current = orderedPhaseEvents[index];
    const next = orderedPhaseEvents[index + 1];
    if (!current?.phaseId) {
      continue;
    }
    if (phaseKeys[phaseKeys.length - 1] !== current.phaseId) {
      phaseKeys.push(current.phaseId);
    }

    if (next?.timestampMs && next.timestampMs > current.timestampMs) {
      phaseDurationsMs[current.phaseId] = next.timestampMs - current.timestampMs;
    }
  }

  const repDurations = events
    .filter((event) => event.type === "rep_complete")
    .map((event) => Number(event.details?.repDurationMs))
    .filter((value) => Number.isFinite(value) && value > 0);

  const holdDurations = events
    .filter((event) => event.type === "hold_end")
    .map((event) => Number(event.details?.durationMs ?? event.details?.holdDurationMs))
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    phaseKeys,
    phaseDurationsMs,
    analyzedDurationMs: Number(summary.analyzedDurationMs ?? 0),
    repDurationMs: repDurations.length > 0 ? repDurations.reduce((total, value) => total + value, 0) / repDurations.length : null,
    holdDurationMs: holdDurations.length > 0 ? holdDurations.reduce((total, value) => total + value, 0) / holdDurations.length : null
  };
}

function resolveStatus(input: { phaseMatched: boolean; timingMatched: boolean | null; timingPresent: boolean }): BenchmarkComparisonStatus {
  if (!input.phaseMatched && input.timingPresent && input.timingMatched === false) {
    return "partial";
  }
  if (!input.phaseMatched) {
    return "phase_mismatch";
  }
  if (input.timingPresent && input.timingMatched === false) {
    return "timing_mismatch";
  }
  return "matched";
}

function buildResult(
  status: BenchmarkComparisonStatus,
  movementType: "rep" | "hold",
  phaseMatch: BenchmarkPhaseMatch,
  timing: BenchmarkTimingComparison,
  reasons: string[]
): BenchmarkComparisonResult {
  const flags: string[] = [];
  if (!phaseMatch.matched) {
    flags.push("phase_sequence_mismatch");
  }
  if (timing.present && timing.matched === false) {
    flags.push("timing_outside_tolerance");
  }
  if (phaseMatch.missingPhases.length > 0) {
    flags.push("missing_phases");
  }
  if (phaseMatch.extraPhases.length > 0) {
    flags.push("extra_phases");
  }

  const scoreBucket = flags.length === 0 ? "high" : flags.length <= 2 ? "medium" : "low";

  return {
    status,
    benchmarkPresent: true,
    movementType,
    phaseMatch,
    timing,
    quality: {
      bucket: scoreBucket === "high" ? "good" : scoreBucket === "medium" ? "fair" : "poor",
      scoreBucket,
      flags
    },
    reasons
  };
}

function createBaseResult(
  status: BenchmarkComparisonStatus,
  movementType: "rep" | "hold",
  overrides?: Partial<Pick<BenchmarkComparisonResult, "benchmarkPresent" | "reasons" | "phaseMatch">>
): BenchmarkComparisonResult {
  return {
    status,
    benchmarkPresent: overrides?.benchmarkPresent ?? false,
    movementType,
    phaseMatch: overrides?.phaseMatch ?? {
      expectedPhaseKeys: [],
      actualPhaseKeys: [],
      matched: false,
      matchedCount: 0,
      missingPhases: [],
      extraPhases: []
    },
    timing: {
      present: false,
      matched: null,
      phaseTimingCompared: []
    },
    quality: {
      bucket: "unknown",
      scoreBucket: "unknown",
      flags: []
    },
    reasons: overrides?.reasons ?? []
  };
}
