import type { DrillBenchmark, DrillBenchmarkPhase, PortableDrill } from "@/lib/schema/contracts";

const BENCHMARK_STATUS_FALLBACK: NonNullable<DrillBenchmark["status"]> = "draft";

export function getDrillBenchmark(drill: PortableDrill): DrillBenchmark | null {
  return drill.benchmark ?? null;
}

export function hasBenchmark(drill: PortableDrill): boolean {
  const benchmark = getDrillBenchmark(drill);
  return Boolean(benchmark && benchmark.sourceType !== "none");
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
