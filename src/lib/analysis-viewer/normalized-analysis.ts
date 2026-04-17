import type { AnalysisEvent } from "../schema/contracts.ts";
import { formatDurationClock, toFiniteNonNegativeMs } from "../format/safe-duration.ts";

export type AnalysisMovementType = "rep" | "hold" | "freestyle";

export type AnalysisSummaryMetricSlot = {
  id: string;
  label: string;
  value: string;
  placeholder?: boolean;
};

export type AnalysisPhaseTimelineSegment = {
  id: string;
  label: string;
  startMs: number;
  endMs: number;
  seekTimestampMs: number;
  interactive: boolean;
};

export type NormalizedAnalysisUiModel = {
  drillLabel: string;
  movementType: AnalysisMovementType;
  movementTypeLabel: string;
  primaryMetricLabel: string;
  primaryMetricValue: string;
  primaryMetricDetail?: string;
  currentPhaseLabel: string;
  confidenceLabel: string;
  feedbackLines: string[];
  summaryMetrics: AnalysisSummaryMetricSlot[];
  phaseTimelineSegments: AnalysisPhaseTimelineSegment[];
};

function formatPercent(value?: number): string {
  if (typeof value !== "number") return "Not available";
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

function describeMovementType(movementType: AnalysisMovementType): string {
  if (movementType === "rep") return "REP drill";
  if (movementType === "hold") return "HOLD drill";
  return "Freestyle";
}

export function buildPhaseTimelineSegments(input: {
  phaseLabels: string[];
  phaseStartsMs?: number[];
  durationMs?: number;
  interactive: boolean;
}): AnalysisPhaseTimelineSegment[] {
  const labels = input.phaseLabels.length > 0 ? input.phaseLabels : ["Phase timeline unavailable"];
  const durationMs = Math.max(1, toFiniteNonNegativeMs(input.durationMs) ?? 1);
  const hasMeasuredStarts = Array.isArray(input.phaseStartsMs) && input.phaseStartsMs.length === labels.length;
  const starts = hasMeasuredStarts
    ? input.phaseStartsMs!.map((value) => Math.max(0, Math.min(durationMs, Math.round(value))))
    : labels.map((_, index) => Math.round((durationMs * index) / labels.length));

  return labels.map((label, index) => {
    const startMs = starts[index] ?? 0;
    const endMs = starts[index + 1] ?? durationMs;
    return {
      id: `phase_${index}_${label}`,
      label,
      startMs,
      endMs: Math.max(startMs + 1, endMs),
      seekTimestampMs: startMs,
      interactive: input.interactive
    };
  });
}

function findCurrentPhaseLabel(phaseLabelsById: Record<string, string>, events: AnalysisEvent[]): string {
  const lastPhaseEvent = [...events].reverse().find((event) => event.type === "phase_enter" && event.phaseId);
  if (!lastPhaseEvent?.phaseId) return "No phase detected yet";
  return phaseLabelsById[lastPhaseEvent.phaseId] ?? "Phase unavailable";
}

function buildPhaseStartsMs(phaseIdsInOrder: string[], events: AnalysisEvent[]): number[] | undefined {
  if (phaseIdsInOrder.length === 0) return undefined;
  const starts = phaseIdsInOrder.map((phaseId) => events.find((event) => event.type === "phase_enter" && event.phaseId === phaseId)?.timestampMs ?? null);
  if (starts.some((value) => value === null)) return undefined;
  return starts.map((value) => Number(value));
}

export function buildNormalizedAnalysisUiModel(input: {
  drillLabel: string;
  movementType: AnalysisMovementType;
  repCount?: number;
  holdDurationMs?: number;
  durationMs?: number;
  confidence?: number;
  events?: AnalysisEvent[];
  phaseLabelsById?: Record<string, string>;
  phaseIdsInOrder?: string[];
  feedbackLines?: string[];
  summaryMetrics?: AnalysisSummaryMetricSlot[];
  phaseTimelineInteractive: boolean;
}): NormalizedAnalysisUiModel {
  const events = input.events ?? [];
  const phaseLabelsById = input.phaseLabelsById ?? {};
  const phaseIdsInOrder = input.phaseIdsInOrder ?? Object.keys(phaseLabelsById);
  const phaseLabels = phaseIdsInOrder.map((phaseId) => phaseLabelsById[phaseId]).filter((label): label is string => Boolean(label));
  const phaseStartsMs = buildPhaseStartsMs(phaseIdsInOrder, events);
  const primaryMetricValue =
    input.movementType === "hold"
      ? formatDurationClock(input.holdDurationMs ?? 0)
      : String(input.repCount ?? 0);

  return {
    drillLabel: input.drillLabel,
    movementType: input.movementType,
    movementTypeLabel: describeMovementType(input.movementType),
    primaryMetricLabel: input.movementType === "hold" ? "Hold duration" : "Rep count",
    primaryMetricValue,
    primaryMetricDetail: input.movementType === "hold" ? "Total hold time in this analysis" : "Completed reps in this analysis",
    currentPhaseLabel: findCurrentPhaseLabel(phaseLabelsById, events),
    confidenceLabel: formatPercent(input.confidence),
    feedbackLines:
      input.feedbackLines && input.feedbackLines.length > 0
        ? input.feedbackLines.slice(0, 2)
        : ["Coach notes not available yet", "Run another analysis for more guidance."],
    summaryMetrics: input.summaryMetrics ?? [
      { id: "quality", label: "Quality", value: "Coming soon", placeholder: true },
      { id: "stability", label: "Stability", value: "Coming soon", placeholder: true },
      { id: "consistency", label: "Consistency", value: "Coming soon", placeholder: true }
    ],
    phaseTimelineSegments: buildPhaseTimelineSegments({
      phaseLabels,
      phaseStartsMs,
      durationMs: input.durationMs,
      interactive: input.phaseTimelineInteractive
    })
  };
}
