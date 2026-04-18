import type { AnalysisEvent } from "../schema/contracts.ts";
import { formatDurationClock, toFiniteNonNegativeMs } from "../format/safe-duration.ts";

export function resolvePhaseLabel(phaseId: string | undefined | null, phaseLabels?: Record<string, string>): string {
  if (!phaseId) return "none";
  return phaseLabels?.[phaseId] ?? phaseId;
}

export function formatReplayTimelineEventLabel(event: AnalysisEvent, phaseLabels?: Record<string, string>): string {
  if (event.type === "rep_complete") {
    return event.repIndex ? `Rep ${event.repIndex}` : "Rep complete";
  }
  if (event.type === "hold_start") {
    return event.phaseId ? `Hold start (${resolvePhaseLabel(event.phaseId, phaseLabels)})` : "Hold start";
  }
  if (event.type === "hold_end") {
    const durationMs = toFiniteNonNegativeMs(Number(event.details?.durationMs ?? 0)) ?? 0;
    const durationLabel = durationMs > 0 ? ` · ${formatDurationClock(durationMs)}` : "";
    return `${event.phaseId ? `Hold end (${resolvePhaseLabel(event.phaseId, phaseLabels)})` : "Hold end"}${durationLabel}`;
  }
  if (event.type === "phase_enter") {
    return event.phaseId ? `Phase: ${resolvePhaseLabel(event.phaseId, phaseLabels)}` : "Phase transition";
  }
  if (event.type === "partial_attempt") {
    const reason = typeof event.details?.reason === "string" ? event.details.reason : undefined;
    if (reason === "skipped_required_phase") {
      const expected = typeof event.details?.expectedPhaseLabel === "string"
        ? event.details.expectedPhaseLabel
        : typeof event.details?.expectedPhaseId === "string"
          ? resolvePhaseLabel(event.details.expectedPhaseId, phaseLabels)
          : null;
      return expected ? `Skipped phase (${expected})` : "Skipped phase";
    }
    if (reason === "broken_sequence" || reason === "sequence_reset") {
      return "Broken sequence";
    }
    if (reason === "abandoned_attempt") {
      return "Incomplete rep";
    }
    return "Incomplete rep";
  }
  return event.type;
}
