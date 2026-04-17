import type { AnalysisEvent } from "../schema/contracts.ts";
import {
  buildAnalysisDomainModel,
  buildAnalysisPanelModel,
  buildAnalysisTimelineSegments,
  type AnalysisMode,
  type AnalysisMovementType,
  type AnalysisSummaryMetricSlot,
  type AnalysisTimelineSegment
} from "./analysis-domain.ts";

export type AnalysisPhaseTimelineSegment = AnalysisTimelineSegment;
export type NormalizedAnalysisUiModel = ReturnType<typeof buildAnalysisPanelModel>;

export function buildPhaseTimelineSegments(input: {
  phaseLabels: string[];
  phaseStartsMs?: number[];
  durationMs?: number;
  interactive: boolean;
}): AnalysisPhaseTimelineSegment[] {
  const phaseIdsInOrder = input.phaseLabels.map((_, index) => `phase_${index}`);
  const phaseLabelsById = Object.fromEntries(phaseIdsInOrder.map((phaseId, index) => [phaseId, input.phaseLabels[index] ?? "Phase"]));
  const phaseStartsById = input.phaseStartsMs && input.phaseStartsMs.length === phaseIdsInOrder.length
    ? Object.fromEntries(phaseIdsInOrder.map((phaseId, index) => [phaseId, input.phaseStartsMs?.[index] ?? 0]))
    : null;

  return buildAnalysisTimelineSegments({
    phaseIdsInOrder,
    phaseLabelsById,
    phaseStartsById,
    durationMs: input.durationMs,
    interactive: input.interactive
  });
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
  phaseLabelMode?: AnalysisMode;
  currentTimestampMs?: number;
  phaseTimelineInteractive: boolean;
}) {
  const domainModel = buildAnalysisDomainModel({
    drillLabel: input.drillLabel,
    movementType: input.movementType,
    repCount: input.repCount,
    holdDurationMs: input.holdDurationMs,
    durationMs: input.durationMs,
    confidence: input.confidence,
    events: input.events,
    phaseLabelsById: input.phaseLabelsById,
    phaseIdsInOrder: input.phaseIdsInOrder,
    feedbackLines: input.feedbackLines,
    summaryMetrics: input.summaryMetrics,
    mode: input.phaseLabelMode,
    currentTimestampMs: input.currentTimestampMs,
    phaseTimelineInteractive: input.phaseTimelineInteractive
  });

  return buildAnalysisPanelModel(domainModel);
}
