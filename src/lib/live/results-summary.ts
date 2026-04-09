import type { AnalysisEvent } from "../schema/contracts.ts";
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

function formatSeconds(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

function buildHoldSummary(events: AnalysisEvent[], fallbackHoldMs: number): string {
  const holdStarts = events.filter((event) => event.type === "hold_start").length;
  const holdEnds = events.filter((event) => event.type === "hold_end");
  const holdCount = Math.max(holdStarts, holdEnds.length);
  const holdDurationMs = holdEnds.reduce((total, event) => total + Number(event.details?.durationMs ?? 0), 0) || fallbackHoldMs;

  if (holdCount <= 0) {
    return "No holds detected";
  }
  return `${holdCount} hold${holdCount === 1 ? "" : "s"} · ${formatSeconds(holdDurationMs)} total`;
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
  return {
    drillLabel: trace.drillSelection.drill?.title ?? "Freestyle",
    durationLabel: formatSeconds(trace.video.durationMs),
    repCount: trace.summary.repCount ?? 0,
    holdSummaryLabel: buildHoldSummary(trace.events, trace.summary.holdDurationMs ?? 0),
    phaseSummaryLabel: buildPhaseSummary(trace.events)
  };
}

function formatPhaseLabel(event: AnalysisEvent): string {
  if (event.phaseId) {
    return `Phase: ${event.phaseId}`;
  }
  return "Phase transition";
}

function formatTimelineEventLabel(event: AnalysisEvent): string {
  if (event.type === "rep_complete") {
    return event.repIndex ? `Rep ${event.repIndex}` : "Rep complete";
  }
  if (event.type === "hold_start") {
    return event.phaseId ? `Hold start (${event.phaseId})` : "Hold start";
  }
  if (event.type === "hold_end") {
    const durationMs = Number(event.details?.durationMs ?? 0);
    const durationLabel = durationMs > 0 ? ` · ${formatSeconds(durationMs)}` : "";
    return `${event.phaseId ? `Hold end (${event.phaseId})` : "Hold end"}${durationLabel}`;
  }
  return formatPhaseLabel(event);
}

export function mapLiveTraceToTimelineMarkers(trace: LiveSessionTrace): LiveTimelineMarker[] {
  return trace.events
    .filter((event) => event.type === "rep_complete" || event.type === "hold_start" || event.type === "hold_end" || event.type === "phase_enter")
    .map((event) => {
      const kind: LiveTimelineMarker["kind"] = event.type === "rep_complete" ? "rep" : event.type.startsWith("hold") ? "hold" : "phase";
      return {
        id: event.eventId,
        timestampMs: event.timestampMs,
        kind,
        label: `${formatSeconds(event.timestampMs)} · ${formatTimelineEventLabel(event)}`
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
