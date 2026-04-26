import type { AnalysisViewerEvent, AnalysisViewerModel, AnalysisViewerPhaseTimelineSegment } from "./types.ts";

export type AnalysisReviewSource = "upload" | "live";
export type AnalysisReviewMovementType = "REP" | "HOLD" | "unknown";
export type AnalysisReviewStatus = "counted" | "incomplete" | "failed" | "uncertain";

export type AnalysisReviewModel = {
  source: AnalysisReviewSource;
  drillLabel: string;
  movementType: AnalysisReviewMovementType;
  totalAnalyzedDurationMs: number;
  statusLabel: string;
  summaryLabel: string;
  mainCoachingFinding?: string;
  repEvents: Array<{
    id: string;
    index: number;
    startMs: number;
    endMs: number;
    durationMs: number;
    status: AnalysisReviewStatus;
    phaseSequence: string[];
    failureReason?: string;
    seekTimestampMs?: number;
  }>;
  holdEvents: Array<{
    id: string;
    index: number;
    startMs: number;
    endMs: number;
    durationMs: number;
    targetStatus?: string;
    matchConfidence?: string;
    phaseLabel?: string;
    seekTimestampMs?: number;
  }>;
  phaseEvents: Array<{
    id: string;
    label: string;
    timestampMs: number;
  }>;
  diagnostics: AnalysisViewerModel["diagnosticsSections"];
};

export function resolveAnalysisReviewMovementType(input: {
  explicitMovementType?: "rep" | "hold" | "freestyle";
  movementTypeLabel?: string;
}): AnalysisReviewMovementType {
  if (input.explicitMovementType === "rep") return "REP";
  if (input.explicitMovementType === "hold") return "HOLD";
  if (input.explicitMovementType === "freestyle") return "unknown";
  const movement = input.movementTypeLabel?.toLowerCase() ?? "";
  if (movement.includes("hold")) return "HOLD";
  if (movement.includes("rep")) return "REP";
  return "unknown";
}

export function formatAnalysisReviewTime(durationMs: number): string {
  const seconds = Math.max(0, durationMs) / 1000;
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds - minutes * 60;
    return `${minutes}:${remainder.toFixed(1).padStart(4, "0")}`;
  }
  return `${seconds.toFixed(1)}s`;
}

function buildRepEvents(events: AnalysisViewerEvent[], segments: AnalysisViewerPhaseTimelineSegment[]): AnalysisReviewModel["repEvents"] {
  const repEvents = events.filter((event) => event.kind === "rep").sort((a, b) => a.timestampMs - b.timestampMs);
  if (repEvents.length === 0) return [];
  const fallbackStart = segments[0]?.startMs ?? 0;
  return repEvents.map((event, index) => {
    const startMs = index === 0 ? fallbackStart : repEvents[index - 1]?.timestampMs ?? fallbackStart;
    const endMs = Math.max(startMs, event.timestampMs);
    const phaseSequence = segments
      .filter((segment) => segment.startMs >= startMs && segment.startMs <= endMs)
      .map((segment) => segment.label);
    const status: AnalysisReviewStatus = phaseSequence.length > 1 ? "counted" : "uncertain";
    return {
      id: `rep_${event.id}_${index + 1}`,
      index: index + 1,
      startMs,
      endMs,
      durationMs: Math.max(0, endMs - startMs),
      status,
      phaseSequence,
      failureReason: status === "uncertain" ? "Could not confirm full phase sequence." : undefined,
      seekTimestampMs: event.seekable ? event.timestampMs : undefined
    };
  });
}

function buildHoldEvents(events: AnalysisViewerEvent[]): AnalysisReviewModel["holdEvents"] {
  const starts = events.filter((event) => event.eventType === "hold_start").sort((a, b) => a.timestampMs - b.timestampMs);
  const ends = events.filter((event) => event.eventType === "hold_end").sort((a, b) => a.timestampMs - b.timestampMs);
  let nextEndIndex = 0;
  return starts.map((start, index) => {
    while (nextEndIndex < ends.length && ends[nextEndIndex]!.timestampMs < start.timestampMs) {
      nextEndIndex += 1;
    }
    const end = ends[nextEndIndex];
    if (end && end.timestampMs >= start.timestampMs) {
      nextEndIndex += 1;
    }
    const endMs = end?.timestampMs ?? start.timestampMs;
    return {
      id: `hold_${start.id}_${index + 1}`,
      index: index + 1,
      startMs: start.timestampMs,
      endMs,
      durationMs: Math.max(0, endMs - start.timestampMs),
      targetStatus: end?.exitReason ? `Ended: ${end.exitReason}` : undefined,
      phaseLabel: start.phaseId,
      seekTimestampMs: start.seekable ? start.timestampMs : undefined
    };
  });
}

export function buildAnalysisReviewModel(model: AnalysisViewerModel, source: AnalysisReviewSource): AnalysisReviewModel {
  const movementType = resolveAnalysisReviewMovementType({
    explicitMovementType: model.panel.movementType,
    movementTypeLabel: model.panel.movementTypeLabel
  });
  const repEvents = buildRepEvents(model.timelineEvents, model.panel.phaseTimelineSegments);
  const holdEvents = buildHoldEvents(model.timelineEvents);
  const mainCoachingFinding = model.panel.coachingFeedback?.primaryIssue?.title ?? model.panel.feedbackLines[0];
  const statusLabel = model.state === "ready" ? "Review ready" : model.stateTitle ?? "Review pending";
  const summaryLabel = movementType === "unknown"
    ? "Freestyle review"
    : movementType === "HOLD"
    ? (holdEvents.length > 0 ? `Longest hold ${formatAnalysisReviewTime(Math.max(...holdEvents.map((hold) => hold.durationMs)))}` : "No holds detected")
    : (repEvents.length > 0 ? `${repEvents.filter((rep) => rep.status === "counted").length} counted` : "No reps detected");
  return {
    source,
    drillLabel: model.panel.drillLabel,
    movementType,
    totalAnalyzedDurationMs: model.timelineDurationMs ?? model.panel.timelineDurationMs ?? 0,
    statusLabel,
    summaryLabel,
    mainCoachingFinding,
    repEvents,
    holdEvents,
    phaseEvents: model.panel.phaseTimelineSegments.map((segment) => ({
      id: segment.id,
      label: segment.label,
      timestampMs: segment.startMs
    })),
    diagnostics: model.diagnosticsSections
  };
}
