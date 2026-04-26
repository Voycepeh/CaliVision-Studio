import type { AnalysisEvent } from "../schema/contracts.ts";
import { formatDurationClock, toFiniteNonNegativeMs } from "../format/safe-duration.ts";
import type { AnalysisViewerPanelModel } from "./types.ts";
import type { CoachingFeedbackOutput } from "../analysis/coaching-feedback.ts";

export type AnalysisMovementType = "rep" | "hold" | "freestyle";
export type AnalysisMode = "latest" | "timestamp";

export type AnalysisSummaryMetricSlot = {
  id: string;
  label: string;
  value: string;
  placeholder?: boolean;
};

export type AnalysisTimelineSegment = {
  id: string;
  label: string;
  startMs: number;
  endMs: number;
  seekTimestampMs: number;
  interactive: boolean;
  phaseId?: string;
  orderIndex?: number;
};

export type AnalysisDrillContext = {
  drillLabel: string;
  movementType: AnalysisMovementType;
  cameraViewLabel?: string;
  authoredPhaseOrder: string[];
  authoredPhaseLabels: Record<string, string>;
};

export type AnalysisSessionSnapshot = {
  currentPhaseLabel: string;
  currentTimestampMs?: number;
  repCount: number;
  holdDurationMs: number;
  confidence?: number;
  durationMs: number;
  phaseTimelineSegments: AnalysisTimelineSegment[];
  mode: AnalysisMode;
};

export type AnalysisDomainModel = {
  drillContext: AnalysisDrillContext;
  sessionSnapshot: AnalysisSessionSnapshot;
  summaryMetricSlots: AnalysisSummaryMetricSlot[];
  feedbackPreviewLines: string[];
  benchmarkFeedback?: {
    summaryLabel: string;
    summaryDescription: string;
    severity: "info" | "warning" | "success";
    findings: Array<{
      id: string;
      title: string;
      description: string;
      severity: "info" | "warning" | "success";
    }>;
    nextSteps: string[];
  };
  coachingFeedback?: CoachingFeedbackOutput;
};

function formatPercent(value?: number): string {
  if (typeof value !== "number") return "Not available";
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

export function describeMovementType(movementType: AnalysisMovementType): string {
  if (movementType === "rep") return "REP drill";
  if (movementType === "hold") return "HOLD drill";
  return "Freestyle";
}

function findCurrentPhaseLabel(phaseLabelsById: Record<string, string>, events: AnalysisEvent[]): string {
  const lastPhaseEvent = [...events].reverse().find((event) => event.type === "phase_enter" && event.phaseId);
  if (!lastPhaseEvent?.phaseId) return "No phase detected yet";
  return phaseLabelsById[lastPhaseEvent.phaseId] ?? "Phase unavailable";
}

function buildPhaseStartsById(phaseIdsInOrder: string[], events: AnalysisEvent[]): Record<string, number> | null {
  if (phaseIdsInOrder.length === 0) return null;
  const entries = phaseIdsInOrder.map((phaseId) => {
    const event = events.find((candidate) => candidate.type === "phase_enter" && candidate.phaseId === phaseId);
    return [phaseId, event?.timestampMs] as const;
  });

  if (entries.some(([, timestamp]) => typeof timestamp !== "number")) {
    return null;
  }

  return Object.fromEntries(entries as Array<[string, number]>);
}

function buildPhaseTransitionsFromEvents(events: AnalysisEvent[]): Array<{ phaseId: string; startMs: number }> {
  const ordered = [...events]
    .filter((event) => event.type === "phase_enter" && event.phaseId && Number.isFinite(event.timestampMs))
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const transitions: Array<{ phaseId: string; startMs: number }> = [];
  for (const phaseEvent of ordered) {
    if (!phaseEvent.phaseId) continue;
    const startMs = Math.max(0, Math.round(phaseEvent.timestampMs));
    const previous = transitions.at(-1);
    if (previous && previous.phaseId === phaseEvent.phaseId) {
      continue;
    }
    transitions.push({ phaseId: phaseEvent.phaseId, startMs });
  }
  return transitions;
}

export function buildAnalysisTimelineSegments(input: {
  phaseIdsInOrder: string[];
  phaseLabelsById: Record<string, string>;
  phaseStartsById: Record<string, number> | null;
  phaseTransitions?: Array<{ phaseId: string; startMs: number }>;
  durationMs?: number;
  interactive: boolean;
}): AnalysisTimelineSegment[] {
  const durationMs = Math.max(1, toFiniteNonNegativeMs(input.durationMs) ?? 1);
  if ((input.phaseTransitions?.length ?? 0) > 0) {
    return input.phaseTransitions!.map((transition, index, array) => {
      const startMs = Math.max(0, Math.min(durationMs, transition.startMs));
      const nextStart = array[index + 1]?.startMs ?? durationMs;
      const endMs = Math.max(startMs + 1, Math.min(durationMs, nextStart));
      const label = input.phaseLabelsById[transition.phaseId] ?? transition.phaseId;
      return {
        id: `phase_detected_${index}_${transition.phaseId}_${startMs}`,
        label,
        startMs,
        endMs,
        seekTimestampMs: startMs,
        interactive: input.interactive,
        phaseId: transition.phaseId,
        orderIndex: index
      };
    });
  }

  const labelsFromIds = input.phaseIdsInOrder
    .map((phaseId) => ({ phaseId, label: input.phaseLabelsById[phaseId] }))
    .filter((phase): phase is { phaseId: string; label: string } => Boolean(phase.label));

  const phases = labelsFromIds.length > 0
    ? labelsFromIds
    : [{ phaseId: "fallback", label: "Phase timeline unavailable" }];

  const starts = phases.map((phase, index) => {
    if (input.phaseStartsById?.[phase.phaseId] !== undefined) {
      return Math.max(0, Math.min(durationMs, Math.round(input.phaseStartsById[phase.phaseId])));
    }
    return Math.round((durationMs * index) / phases.length);
  });

  return phases.map((phase, index) => {
    const startMs = starts[index] ?? 0;
    const next = starts[index + 1] ?? durationMs;
    const endMs = Math.max(startMs + 1, next);
    return {
      id: `phase_${index}_${phase.label}`,
      label: phase.label,
      startMs,
      endMs,
      seekTimestampMs: startMs,
      interactive: input.interactive,
      phaseId: phase.phaseId === "fallback" ? undefined : phase.phaseId,
      orderIndex: phase.phaseId === "fallback" ? undefined : index
    };
  });
}

export function buildAnalysisDomainModel(input: {
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
  benchmarkFeedback?: AnalysisDomainModel["benchmarkFeedback"];
  coachingFeedback?: AnalysisDomainModel["coachingFeedback"];
  mode?: AnalysisMode;
  currentTimestampMs?: number;
  phaseTimelineInteractive: boolean;
  cameraViewLabel?: string;
}): AnalysisDomainModel {
  const events = input.events ?? [];
  const phaseLabelsById = input.phaseLabelsById ?? {};
  const phaseIdsInOrder = input.phaseIdsInOrder ?? Object.keys(phaseLabelsById);
  const durationMs = toFiniteNonNegativeMs(input.durationMs) ?? 0;
  const currentTimestampMs = toFiniteNonNegativeMs(input.currentTimestampMs);
  const mode = input.mode ?? "latest";

  const phaseAtTimestamp = (() => {
    if (mode !== "timestamp" || currentTimestampMs === null) {
      return null;
    }

    const activePhaseEnter = events
      .filter((event) => event.type === "phase_enter" && event.phaseId && event.timestampMs <= currentTimestampMs)
      .sort((a, b) => a.timestampMs - b.timestampMs)
      .at(-1);

    if (!activePhaseEnter?.phaseId) {
      return "No phase detected yet";
    }

    return phaseLabelsById[activePhaseEnter.phaseId] ?? "Phase unavailable";
  })();

  const phaseStartsById = buildPhaseStartsById(phaseIdsInOrder, events);
  const phaseTransitions = buildPhaseTransitionsFromEvents(events);

  return {
    drillContext: {
      drillLabel: input.drillLabel,
      movementType: input.movementType,
      cameraViewLabel: input.cameraViewLabel,
      authoredPhaseOrder: phaseIdsInOrder,
      authoredPhaseLabels: phaseLabelsById
    },
    sessionSnapshot: {
      currentPhaseLabel: phaseAtTimestamp ?? findCurrentPhaseLabel(phaseLabelsById, events),
      currentTimestampMs: mode === "timestamp" ? currentTimestampMs ?? undefined : undefined,
      repCount: input.repCount ?? 0,
      holdDurationMs: input.holdDurationMs ?? 0,
      confidence: input.confidence,
      durationMs,
      mode,
      phaseTimelineSegments: buildAnalysisTimelineSegments({
        phaseIdsInOrder,
        phaseLabelsById,
        phaseStartsById,
        phaseTransitions,
        durationMs,
        interactive: input.phaseTimelineInteractive
      })
    },
    feedbackPreviewLines:
      input.feedbackLines && input.feedbackLines.length > 0
        ? input.feedbackLines.slice(0, 2)
        : ["Coach notes not available yet", "Run another analysis for more guidance."],
    benchmarkFeedback: input.benchmarkFeedback,
    coachingFeedback: input.coachingFeedback,
    summaryMetricSlots: input.summaryMetrics ?? [
      { id: "quality", label: "Quality", value: "Coming soon", placeholder: true },
      { id: "stability", label: "Stability", value: "Coming soon", placeholder: true },
      { id: "consistency", label: "Consistency", value: "Coming soon", placeholder: true }
    ]
  };
}

export function buildAnalysisPanelModel(domainModel: AnalysisDomainModel): AnalysisViewerPanelModel {
  const { drillContext, sessionSnapshot } = domainModel;
  return {
    drillLabel: drillContext.drillLabel,
    movementType: drillContext.movementType,
    movementTypeLabel: describeMovementType(drillContext.movementType),
    primaryMetricLabel: drillContext.movementType === "hold" ? "Hold duration" : "Rep count",
    primaryMetricValue:
      drillContext.movementType === "hold"
        ? formatDurationClock(sessionSnapshot.holdDurationMs)
        : String(sessionSnapshot.repCount),
    primaryMetricDetail:
      drillContext.movementType === "hold"
        ? (sessionSnapshot.mode === "timestamp" ? "Current hold at playhead" : "Total hold time in this analysis")
        : (sessionSnapshot.mode === "timestamp" ? "Completed reps so far" : "Completed reps in this analysis"),
    currentPhaseLabel: sessionSnapshot.currentPhaseLabel,
    confidenceLabel: formatPercent(sessionSnapshot.confidence),
    feedbackLines: domainModel.feedbackPreviewLines,
    summaryMetrics: domainModel.summaryMetricSlots,
    benchmarkFeedback: domainModel.benchmarkFeedback,
    coachingFeedback: domainModel.coachingFeedback
      ? {
          summaryLabel: domainModel.coachingFeedback.summaryLabel,
          summaryDescription: domainModel.coachingFeedback.summaryDescription,
          positives: domainModel.coachingFeedback.positives.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            cueText: item.cueText
          })),
          primaryIssue: domainModel.coachingFeedback.primaryIssue
            ? {
                id: domainModel.coachingFeedback.primaryIssue.id,
                title: domainModel.coachingFeedback.primaryIssue.title,
                description: domainModel.coachingFeedback.primaryIssue.description,
                cueText: domainModel.coachingFeedback.primaryIssue.cueText
              }
            : undefined,
          improvements: domainModel.coachingFeedback.improvements.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            cueText: item.cueText
          })),
          bodyPartBreakdown: domainModel.coachingFeedback.bodyPartBreakdown.map((item) => ({
            bodyPart: item.bodyPart,
            observation: item.observation,
            correction: item.correction
          })),
          mentalModel: domainModel.coachingFeedback.mentalModel,
          orderedFixSteps: domainModel.coachingFeedback.orderedFixSteps.map((item) => ({
            order: item.order,
            title: item.title,
            instruction: item.instruction,
            cueText: item.cueText
          })),
          nextSteps: domainModel.coachingFeedback.nextSteps
        }
      : undefined,
    phaseTimelineSegments: sessionSnapshot.phaseTimelineSegments,
    currentTimestampMs: sessionSnapshot.currentTimestampMs,
    timelineDurationMs: sessionSnapshot.durationMs
  };
}
