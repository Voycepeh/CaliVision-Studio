import type { AnalysisEvent, AnalysisEventType } from "../schema/contracts.ts";
import type { AnalysisSessionRecord } from "./session-repository.ts";

export type ReplayTimelineMarker = {
  eventId: string;
  timestampMs: number;
  type: AnalysisEventType;
  phaseId?: string;
  repIndex?: number;
};

export type ReplayDerivedState = {
  timestampMs: number;
  activePhaseId: string | null;
  repCount: number;
  holdActive: boolean;
  holdElapsedMs: number;
  detectedHoldMs: number;
  bestHoldMs: number;
  nearestEvent: AnalysisEvent | null;
};

export type ReplayOverlayState = ReplayDerivedState & {
  phaseLabel: string | null;
  measurementType: "rep" | "hold" | "hybrid" | null;
  showRepCount: boolean;
  showHoldTimer: boolean;
  statusLabel?: string;
  repOutcome?: {
    kind: "rep_counted" | "rep_in_progress" | "incomplete_rep" | "skipped_phase" | "broken_sequence";
    label: string;
  };
};

export type ReplayOverlaySample = {
  timestampMs: number;
  state: ReplayOverlayState;
};

export type ReplaySessionOverview = {
  durationMs: number;
  phaseCoverage: Array<{ phaseId: string; percent: number }>;
  qualityLabel: string;
};

const MARKER_TYPES: AnalysisEventType[] = [
  "phase_enter",
  "rep_complete",
  "hold_start",
  "hold_end",
  "invalid_transition",
  "partial_attempt"
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toSafeTimestampMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function getSortedFrameSamples(session: AnalysisSessionRecord) {
  return session.frameSamples
    .filter((frame) => Number.isFinite(frame.timestampMs) && frame.timestampMs >= 0)
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

function getSortedEvents(session: AnalysisSessionRecord) {
  return session.events
    .filter((event) => Number.isFinite(event.timestampMs) && event.timestampMs >= 0)
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

export function getReplayDurationMs(session?: AnalysisSessionRecord | null): number {
  if (!session) {
    return 0;
  }
  const fromSummary = toSafeTimestampMs(session.summary.analyzedDurationMs ?? 0);
  if (fromSummary > 0) {
    return fromSummary;
  }
  const sortedFrames = getSortedFrameSamples(session);
  const sortedEvents = getSortedEvents(session);
  const fromFrames = toSafeTimestampMs(sortedFrames.at(-1)?.timestampMs ?? 0);
  const fromEvents = toSafeTimestampMs(sortedEvents.at(-1)?.timestampMs ?? 0);
  return Math.max(fromSummary, fromFrames, fromEvents, 0);
}

function getFramePhaseAtTime(frameSamples: AnalysisSessionRecord["frameSamples"], timestampMs: number): string | null {
  if (frameSamples.length === 0) {
    return null;
  }

  let candidate = frameSamples[0];
  for (const frame of frameSamples) {
    if (frame.timestampMs > timestampMs) {
      break;
    }
    candidate = frame;
  }
  return candidate?.classifiedPhaseId ?? null;
}

function getPhaseEventAtTime(events: AnalysisSessionRecord["events"], timestampMs: number): string | null {
  return (
    events
      .filter((event) => event.type === "phase_enter" && event.timestampMs <= timestampMs)
      .at(-1)?.phaseId ?? null
  );
}

function getRepCountAtTime(events: AnalysisSessionRecord["events"], timestampMs: number): number {
  const reps = events.filter((event) => event.type === "rep_complete" && event.timestampMs <= timestampMs);
  if (reps.length === 0) {
    return 0;
  }
  const indexedRep = reps.reduce((max, current) => Math.max(max, current.repIndex ?? 0), 0);
  return Math.max(reps.length, indexedRep);
}

function toRepOutcomeLabel(
  events: AnalysisSessionRecord["events"],
  timestampMs: number
): ReplayOverlayState["repOutcome"] | undefined {
  const lastRepEvent = events
    .filter((event) => event.type === "rep_complete" && event.timestampMs <= timestampMs)
    .at(-1);
  const lastPartial = events
    .filter((event) => event.type === "partial_attempt" && event.timestampMs <= timestampMs)
    .at(-1);
  const lastPhaseEnter = events
    .filter((event) => event.type === "phase_enter" && event.timestampMs <= timestampMs)
    .at(-1);

  const lastTerminalTimestamp = Math.max(lastRepEvent?.timestampMs ?? -1, lastPartial?.timestampMs ?? -1);
  if (lastRepEvent && (lastRepEvent.timestampMs >= (lastPartial?.timestampMs ?? -1))) {
    return {
      kind: "rep_counted",
      label: "Rep counted"
    };
  }

  if (lastPartial && lastPartial.timestampMs >= (lastRepEvent?.timestampMs ?? -1)) {
    const reason = typeof lastPartial.details?.reason === "string" ? lastPartial.details.reason : undefined;
    if (reason === "skipped_required_phase") {
      const missing = typeof lastPartial.details?.expectedPhaseLabel === "string"
        ? lastPartial.details.expectedPhaseLabel
        : typeof lastPartial.details?.expectedPhaseId === "string"
          ? lastPartial.details.expectedPhaseId
          : null;
      return {
        kind: "skipped_phase",
        label: missing ? `Skipped phase: ${missing}` : "Skipped phase"
      };
    }
    if (reason === "broken_sequence" || reason === "sequence_reset") {
      return { kind: "broken_sequence", label: "Broken sequence" };
    }
    return { kind: "incomplete_rep", label: "Incomplete rep" };
  }

  if (lastPhaseEnter && lastPhaseEnter.timestampMs >= lastTerminalTimestamp) {
    return { kind: "rep_in_progress", label: "Rep in progress" };
  }

  return undefined;
}

function getHoldWindow(
  events: AnalysisSessionRecord["events"],
  timestampMs: number
): { holdActive: boolean; holdElapsedMs: number; detectedHoldMs: number; bestHoldMs: number } {
  let activeStartMs: number | null = null;
  let detectedHoldMs = 0;
  let bestHoldMs = 0;

  for (const event of events) {
    if (event.timestampMs > timestampMs) {
      break;
    }
    if (event.type === "hold_start") {
      if (activeStartMs === null) {
        activeStartMs = Math.max(0, event.timestampMs);
      }
      continue;
    }
    if (event.type === "hold_end" && activeStartMs !== null) {
      const endMs = Math.max(activeStartMs, event.timestampMs);
      const durationMs = Math.max(0, endMs - activeStartMs);
      detectedHoldMs += durationMs;
      bestHoldMs = Math.max(bestHoldMs, durationMs);
      activeStartMs = null;
    }
  }

  if (activeStartMs === null) {
    return { holdActive: false, holdElapsedMs: 0, detectedHoldMs, bestHoldMs };
  }

  const holdElapsedMs = Math.max(0, timestampMs - activeStartMs);
  return {
    holdActive: true,
    holdElapsedMs,
    detectedHoldMs,
    bestHoldMs: Math.max(bestHoldMs, holdElapsedMs)
  };
}

export function deriveReplayStateAtTime(session: AnalysisSessionRecord | null | undefined, timestampMs: number): ReplayDerivedState {
  if (!session) {
    return {
      timestampMs: 0,
      activePhaseId: null,
      repCount: 0,
      holdActive: false,
      holdElapsedMs: 0,
      detectedHoldMs: 0,
      bestHoldMs: 0,
      nearestEvent: null
    };
  }

  const durationMs = toSafeTimestampMs(getReplayDurationMs(session));
  const clampedTimestamp = clamp(toSafeTimestampMs(timestampMs), 0, durationMs);
  const sortedEvents = getSortedEvents(session);
  const sortedFrameSamples = getSortedFrameSamples(session);
  const nearestEvent =
    sortedEvents
      .filter((event) => event.timestampMs <= clampedTimestamp)
      .at(-1) ?? null;

  const { holdActive, holdElapsedMs, detectedHoldMs, bestHoldMs } = getHoldWindow(sortedEvents, clampedTimestamp);

  return {
    timestampMs: clampedTimestamp,
    activePhaseId: getFramePhaseAtTime(sortedFrameSamples, clampedTimestamp),
    repCount: getRepCountAtTime(sortedEvents, clampedTimestamp),
    holdActive,
    holdElapsedMs,
    detectedHoldMs,
    bestHoldMs,
    nearestEvent
  };
}

export function deriveReplayOverlayStateAtTime(
  session: AnalysisSessionRecord | null | undefined,
  timestampMs: number
): ReplayOverlayState {
  const base = deriveReplayStateAtTime(session, timestampMs);
  if (!session) {
    return {
      ...base,
      phaseLabel: null,
      measurementType: null,
      showRepCount: false,
      showHoldTimer: false,
      statusLabel: undefined
    };
  }

  const sortedEvents = getSortedEvents(session);
  const phaseFromEvents = getPhaseEventAtTime(sortedEvents, base.timestampMs);
  const hasHoldSignal =
    session.summary.holdDurationMs !== undefined ||
    sortedEvents.some((event) => event.type === "hold_start" || event.type === "hold_end");
  const measurementType = session.drillMeasurementType ?? (hasHoldSignal ? "hold" : "rep");
  const repOutcome = (measurementType === "rep" || measurementType === "hybrid")
    ? toRepOutcomeLabel(sortedEvents, base.timestampMs)
    : undefined;

  return {
    ...base,
    phaseLabel: base.activePhaseId ?? phaseFromEvents,
    measurementType,
    showRepCount: measurementType === "rep" || measurementType === "hybrid",
    showHoldTimer: measurementType === "hold" || measurementType === "hybrid",
    statusLabel: (measurementType === "rep" || measurementType === "hybrid")
      ? repOutcome?.label ?? (session.debug?.noEventCause === "low_confidence_frames" ? "Low confidence" : undefined)
      : session.debug?.noEventCause === "low_confidence_frames"
        ? "Low confidence"
        : undefined,
    repOutcome
  };
}

export function buildReplayOverlaySamples(
  session: AnalysisSessionRecord | null | undefined,
  timestampsMs: number[]
): ReplayOverlaySample[] {
  if (!session || timestampsMs.length === 0) {
    return [];
  }
  const uniqueSorted = Array.from(new Set(timestampsMs.map((timestamp) => toSafeTimestampMs(timestamp))))
    .sort((a, b) => a - b);
  return uniqueSorted.map((timestampMs) => ({
    timestampMs,
    state: deriveReplayOverlayStateAtTime(session, timestampMs)
  }));
}

export function getOverlaySampleAtTime(samples: ReplayOverlaySample[], timestampMs: number): ReplayOverlayState | null {
  if (samples.length === 0) {
    return null;
  }
  const target = toSafeTimestampMs(timestampMs);
  let low = 0;
  let high = samples.length - 1;
  let candidate = samples[0];

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = samples[mid];
    if (current.timestampMs <= target) {
      candidate = current;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return candidate.state;
}

export function deriveReplayMarkers(session: AnalysisSessionRecord | null | undefined): ReplayTimelineMarker[] {
  if (!session) {
    return [];
  }

  return getSortedEvents(session)
    .filter((event) => MARKER_TYPES.includes(event.type))
    .map((event) => ({
      eventId: event.eventId,
      timestampMs: event.timestampMs,
      type: event.type,
      phaseId: event.phaseId,
      repIndex: event.repIndex
    }));
}

export function deriveReplaySessionOverview(session: AnalysisSessionRecord | null | undefined): ReplaySessionOverview {
  if (!session) {
    return { durationMs: 0, phaseCoverage: [], qualityLabel: "n/a" };
  }

  const durationMs = getReplayDurationMs(session);
  const phaseCounts = new Map<string, number>();
  const sortedFrameSamples = getSortedFrameSamples(session);
  for (const frame of sortedFrameSamples) {
    if (!frame.classifiedPhaseId) {
      continue;
    }
    phaseCounts.set(frame.classifiedPhaseId, (phaseCounts.get(frame.classifiedPhaseId) ?? 0) + 1);
  }

  const totalFrames = Array.from(phaseCounts.values()).reduce((sum, count) => sum + count, 0);
  const phaseCoverage = Array.from(phaseCounts.entries())
    .map(([phaseId, count]) => ({ phaseId, percent: totalFrames > 0 ? (count / totalFrames) * 100 : 0 }))
    .sort((a, b) => b.percent - a.percent);

  const confidence = session.summary.confidenceAvg;
  const qualityLabel = typeof confidence === "number" ? `${Math.round(confidence * 100)}% confidence` : "n/a";
  return { durationMs, phaseCoverage, qualityLabel };
}
