import type { AnalysisEvent } from "../schema/contracts.ts";
import { formatDurationClock, toFiniteNonNegativeMs } from "../format/safe-duration.ts";
import { formatReplayTimelineEventLabel } from "../analysis/event-labels.ts";
import type { LiveSessionTrace } from "./types.ts";

export type ReplayTerminalState =
  | "idle"
  | "export-in-progress"
  | "annotated-ready"
  | "raw-fallback"
  | "export-failed";

export type LiveTimelineMarker = {
  id: string;
  timestampMs: number;
  kind: "rep" | "hold" | "phase";
  label: string;
};

export type LiveResultsSummary = {
  drillLabel: string;
  durationLabel: string;
  repCount: number;
  holdSummaryLabel: string;
  phaseSummaryLabel: string;
};

function buildHoldSummary(events: AnalysisEvent[], fallbackHoldMs: number): string {
  const holdStarts = events.filter((event) => event.type === "hold_start").length;
  const holdEnds = events.filter((event) => event.type === "hold_end");
  const holdCount = Math.max(holdStarts, holdEnds.length);
  const holdDurationMsFromEvents = holdEnds.reduce((total, event) => {
    const durationMs = toFiniteNonNegativeMs(Number(event.details?.durationMs ?? 0));
    return total + (durationMs ?? 0);
  }, 0);
  const safeFallbackHoldMs = toFiniteNonNegativeMs(fallbackHoldMs) ?? 0;
  const holdDurationMs = holdDurationMsFromEvents > 0 ? holdDurationMsFromEvents : safeFallbackHoldMs;

  if (holdCount <= 0) {
    return "No holds detected";
  }
  if (holdDurationMs <= 0) {
    return `${holdCount} hold${holdCount === 1 ? "" : "s"} · Duration unavailable`;
  }
  return `${holdCount} hold${holdCount === 1 ? "" : "s"} · ${formatDurationClock(holdDurationMs)} total`;
}

function buildPhaseSummary(events: AnalysisEvent[]): string {
  const transitions = events.filter((event) => event.type === "phase_enter");
  if (transitions.length === 0) {
    return "No phase transitions detected";
  }

  const uniquePhases = new Set(transitions.map((event) => event.phaseId).filter(Boolean));
  return `${transitions.length} transition${transitions.length === 1 ? "" : "s"} · ${uniquePhases.size} phase${uniquePhases.size === 1 ? "" : "s"}`;
}

export function buildLiveResultsSummary(trace: LiveSessionTrace): LiveResultsSummary {
  const durationMs = toFiniteNonNegativeMs(trace.video.durationMs);
  return {
    drillLabel: trace.drillSelection.drill?.title ?? "Freestyle",
    durationLabel: durationMs === null ? "Duration unavailable" : formatDurationClock(durationMs),
    repCount: trace.summary.repCount ?? 0,
    holdSummaryLabel: buildHoldSummary(trace.events, trace.summary.holdDurationMs ?? 0),
    phaseSummaryLabel: buildPhaseSummary(trace.events)
  };
}

export function mapLiveTraceToTimelineMarkers(trace: LiveSessionTrace, phaseLabels?: Record<string, string>): LiveTimelineMarker[] {
  return trace.events
    .filter((event) => event.type === "rep_complete" || event.type === "hold_start" || event.type === "hold_end" || event.type === "phase_enter")
    .map((event) => {
      const kind: LiveTimelineMarker["kind"] = event.type === "rep_complete" ? "rep" : event.type.startsWith("hold") ? "hold" : "phase";
      return {
        id: event.eventId,
        timestampMs: event.timestampMs,
        kind,
        label: `${formatDurationClock(event.timestampMs)} · ${formatReplayTimelineEventLabel(event, phaseLabels)}`
      };
    })
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

export function getReplayStateMessage(state: ReplayTerminalState): string {
  if (state === "annotated-ready") return "Annotated replay ready";
  if (state === "raw-fallback") return "Annotated replay failed. Showing raw recording fallback";
  if (state === "export-in-progress") return "Exporting annotated replay…";
  if (state === "export-failed") return "Replay export failed";
  return "No replay available yet";
}

export function getReplayStateTone(state: ReplayTerminalState): "neutral" | "success" | "warning" | "danger" {
  if (state === "annotated-ready") return "success";
  if (state === "raw-fallback") return "warning";
  if (state === "export-failed") return "danger";
  return "neutral";
}
