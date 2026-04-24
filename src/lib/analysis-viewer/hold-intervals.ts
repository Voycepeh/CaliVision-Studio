import type { AnalysisViewerEvent, AnalysisViewerPhaseTimelineSegment } from "./types";

export type HoldInterval = {
  id: string;
  kind: "hold";
  index: number;
  startMs: number;
  endMs: number;
  phaseLabel?: string;
  exitReason?: string;
  checkpoints: Array<{ id: string; label: string; timestampMs: number }>;
};

export function resolveHoldPhaseLabel(phaseId: string | undefined, segments: AnalysisViewerPhaseTimelineSegment[]): string | undefined {
  if (!phaseId) {
    return undefined;
  }
  const authoredLabel = segments.find((segment) => segment.phaseId === phaseId)?.label;
  if (authoredLabel) {
    return authoredLabel;
  }
  if (phaseId.startsWith("phase_")) {
    return undefined;
  }
  return phaseId;
}

export function formatHoldExitReason(reason: string): string {
  if (reason === "match_rejected") return "Pose no longer matched";
  if (reason === "low_confidence") return "Pose tracking lost";
  if (reason === "phase_replaced") return "Moved to another phase";
  if (reason === "phase_exit") return "Left hold phase";
  if (reason === "session_end") return "Session ended";
  return reason.replaceAll("_", " ");
}

export function buildHoldIntervals(
  events: AnalysisViewerEvent[],
  segments: AnalysisViewerPhaseTimelineSegment[]
): HoldInterval[] {
  const intervals: HoldInterval[] = [];
  let activeStart: AnalysisViewerEvent | null = null;
  let intervalIndex = 0;
  for (const event of events.filter((item) => item.kind === "hold").sort((a, b) => a.timestampMs - b.timestampMs)) {
    if (event.eventType === "hold_start") {
      activeStart = event;
      continue;
    }
    if (event.eventType !== "hold_end" || !activeStart) {
      continue;
    }
    intervalIndex += 1;
    const startMs = Math.max(0, Math.round(activeStart.timestampMs));
    const endMs = Math.max(startMs, Math.round(event.timestampMs));
    const phaseLabel = resolveHoldPhaseLabel(activeStart.phaseId, segments);
    const generatedCheckpoint = {
      id: `${activeStart.id}-checkpoint`,
      label: phaseLabel ?? "Hold phase",
      timestampMs: startMs
    };
    const segmentCheckpoints = segments
      .filter((segment) => segment.startMs >= startMs && segment.startMs <= endMs)
      .map((segment) => ({ id: segment.id, label: segment.label, timestampMs: segment.startMs }));
    const checkpoints = dedupeCheckpoints([generatedCheckpoint, ...segmentCheckpoints]);

    intervals.push({
      id: `hold_${intervalIndex}_${startMs}_${endMs}`,
      kind: "hold",
      index: intervalIndex,
      startMs,
      endMs,
      phaseLabel,
      exitReason: event.exitReason,
      checkpoints
    });
    activeStart = null;
  }

  return intervals;
}

function dedupeCheckpoints(checkpoints: Array<{ id: string; label: string; timestampMs: number }>) {
  const seen = new Set<string>();
  return checkpoints.filter((checkpoint) => {
    const key = `${checkpoint.label}|${checkpoint.timestampMs}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
