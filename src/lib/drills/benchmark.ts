import type { DrillBenchmark, DrillBenchmarkPhase, PortableDrill } from "@/lib/schema/contracts";

const BENCHMARK_STATUS_FALLBACK: NonNullable<DrillBenchmark["status"]> = "draft";

type SyncBenchmarkOptions = {
  overwriteExisting?: boolean;
};

export type DrillBenchmarkSummary = {
  present: boolean;
  sourceType: DrillBenchmark["sourceType"];
  phaseCount: number;
  hasTiming: boolean;
  status: DrillBenchmark["status"];
};

export function getDrillBenchmark(drill: PortableDrill): DrillBenchmark | null {
  return drill.benchmark ?? null;
}

export function hasBenchmark(drill: PortableDrill): boolean {
  const benchmark = getDrillBenchmark(drill);
  return Boolean(benchmark && benchmark.sourceType !== "none");
}

export function hasBenchmarkTiming(benchmark: DrillBenchmark | null | undefined): boolean {
  if (!benchmark) {
    return false;
  }

  const timing = benchmark.timing;
  const hasAggregateTiming =
    (typeof timing?.expectedRepDurationMs === "number" && timing.expectedRepDurationMs > 0) ||
    (typeof timing?.targetHoldDurationMs === "number" && timing.targetHoldDurationMs > 0);

  if (hasAggregateTiming) {
    return true;
  }

  if (timing?.phaseDurationsMs) {
    for (const value of Object.values(timing.phaseDurationsMs)) {
      if (typeof value === "number" && value > 0) {
        return true;
      }
    }
  }

  return normalizeBenchmarkPhases(benchmark.phaseSequence ?? []).some((phase) => typeof phase.targetDurationMs === "number" && phase.targetDurationMs > 0);
}

export function summarizeBenchmark(benchmark: DrillBenchmark | null | undefined): DrillBenchmarkSummary {
  const normalized = normalizeDrillBenchmark(benchmark);
  return {
    present: Boolean(normalized && normalized.sourceType !== "none"),
    sourceType: normalized?.sourceType ?? "none",
    phaseCount: normalized?.phaseSequence?.length ?? 0,
    hasTiming: hasBenchmarkTiming(normalized),
    status: normalized?.status ?? BENCHMARK_STATUS_FALLBACK
  };
}

export function getNormalizedBenchmarkPhases(drill: PortableDrill): DrillBenchmarkPhase[] {
  const benchmark = getDrillBenchmark(drill);
  if (!benchmark?.phaseSequence?.length) {
    return [];
  }

  return normalizeBenchmarkPhases(benchmark.phaseSequence);
}

export function mapAuthoredPhasesToBenchmark(drill: PortableDrill): Array<{
  authoredPhaseId: string;
  authoredPhaseLabel: string;
  benchmarkPhaseKey: string | null;
}> {
  const benchmarkByOrder = new Map(
    getNormalizedBenchmarkPhases(drill)
      .filter((phase) => Number.isFinite(phase.order))
      .map((phase) => [phase.order, phase.key] as const)
  );

  return [...drill.phases]
    .sort((a, b) => a.order - b.order)
    .map((phase) => ({
      authoredPhaseId: phase.phaseId,
      authoredPhaseLabel: phase.name,
      benchmarkPhaseKey: benchmarkByOrder.get(phase.order) ?? null
    }));
}

export function createBenchmarkFromDrillPhases(drill: PortableDrill): DrillBenchmark {
  const previous = normalizeDrillBenchmark(drill.benchmark);
  const normalizedPhases = [...drill.phases]
    .sort((a, b) => a.order - b.order)
    .map((phase, index) => ({
      key: phase.phaseId?.trim() || `benchmark_phase_${index + 1}`,
      label: phase.name?.trim() || `Phase ${index + 1}`,
      order: index + 1,
      targetDurationMs: typeof phase.durationMs === "number" && phase.durationMs > 0 ? phase.durationMs : undefined,
      notes: phase.summary?.trim() || undefined,
      pose: phase.poseSequence?.[0] ? structuredClone(phase.poseSequence[0]) : undefined
    }));

  const phaseDurationsMs = Object.fromEntries(
    normalizedPhases
      .filter((phase) => typeof phase.targetDurationMs === "number" && phase.targetDurationMs > 0)
      .map((phase) => [phase.key, phase.targetDurationMs as number])
  );

  const nextTiming: DrillBenchmark["timing"] = {
    ...(previous?.timing ?? {}),
    phaseDurationsMs
  };

  if (drill.drillType === "rep") {
    if (!(typeof nextTiming.expectedRepDurationMs === "number" && nextTiming.expectedRepDurationMs > 0)) {
      const totalPhaseDuration = normalizedPhases.reduce((acc, phase) => acc + (phase.targetDurationMs ?? 0), 0);
      if (totalPhaseDuration > 0) {
        nextTiming.expectedRepDurationMs = totalPhaseDuration;
      }
    }
    nextTiming.targetHoldDurationMs = undefined;
  } else {
    if (!(typeof nextTiming.targetHoldDurationMs === "number" && nextTiming.targetHoldDurationMs > 0)) {
      const primary = normalizedPhases[0]?.targetDurationMs;
      if (typeof primary === "number" && primary > 0) {
        nextTiming.targetHoldDurationMs = primary;
      }
    }
    nextTiming.expectedRepDurationMs = undefined;
  }

  return normalizeDrillBenchmark({
    ...(previous ?? {}),
    sourceType: previous?.sourceType && previous.sourceType !== "none" ? previous.sourceType : "reference_pose_sequence",
    movementType: previous?.movementType ?? drill.drillType,
    cameraView: previous?.cameraView ?? drill.primaryView,
    status: previous?.status ?? BENCHMARK_STATUS_FALLBACK,
    phaseSequence: normalizedPhases,
    timing: nextTiming
  }) as DrillBenchmark;
}

export function syncBenchmarkFromDrillPhases(drill: PortableDrill, options: SyncBenchmarkOptions = {}): boolean {
  const hasExisting = Boolean(drill.benchmark?.phaseSequence?.length);
  if (hasExisting && !options.overwriteExisting) {
    return false;
  }

  drill.benchmark = createBenchmarkFromDrillPhases(drill);
  return true;
}

export function normalizeBenchmarkPhases(phases: DrillBenchmarkPhase[]): DrillBenchmarkPhase[] {
  return [...phases]
    .map((phase, index) => {
      const fallbackOrder = index + 1;
      const normalizedOrder = typeof phase.order === "number" && Number.isFinite(phase.order) && phase.order > 0 ? phase.order : fallbackOrder;
      const fallbackKey = `benchmark_phase_${fallbackOrder}`;
      const normalizedKey = phase.key?.trim() || fallbackKey;

      return {
        ...phase,
        key: normalizedKey,
        order: normalizedOrder,
        label: phase.label?.trim() || undefined,
        notes: phase.notes?.trim() || undefined,
        targetDurationMs:
          typeof phase.targetDurationMs === "number" && Number.isFinite(phase.targetDurationMs) && phase.targetDurationMs > 0
            ? phase.targetDurationMs
            : undefined
      };
    })
    .sort((a, b) => a.order - b.order)
    .map((phase, index) => ({ ...phase, order: index + 1 }));
}

export function normalizeDrillBenchmark(benchmark: DrillBenchmark | null | undefined): DrillBenchmark | null {
  if (!benchmark) {
    return null;
  }

  const sourceType = benchmark.sourceType ?? "none";
  const phaseSequence = benchmark.phaseSequence ? normalizeBenchmarkPhases(benchmark.phaseSequence) : [];
  const timing = benchmark.timing
    ? {
        expectedRepDurationMs:
          typeof benchmark.timing.expectedRepDurationMs === "number" && benchmark.timing.expectedRepDurationMs > 0
            ? benchmark.timing.expectedRepDurationMs
            : undefined,
        targetHoldDurationMs:
          typeof benchmark.timing.targetHoldDurationMs === "number" && benchmark.timing.targetHoldDurationMs > 0
            ? benchmark.timing.targetHoldDurationMs
            : undefined,
        phaseDurationsMs: benchmark.timing.phaseDurationsMs ?? {}
      }
    : undefined;

  return {
    ...benchmark,
    sourceType,
    id: benchmark.id?.trim() || undefined,
    label: benchmark.label?.trim() || undefined,
    description: benchmark.description?.trim() || undefined,
    phaseSequence,
    timing,
    status: benchmark.status ?? BENCHMARK_STATUS_FALLBACK
  };
}
