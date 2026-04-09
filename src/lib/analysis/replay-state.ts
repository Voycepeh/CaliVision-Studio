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
  nearestEvent: AnalysisEvent | null;
};

export type ReplayOverlayState = ReplayDerivedState & {
  phaseLabel: string | null;
  measurementType: "rep" | "hold" | "hybrid" | null;
  showRepCount: boolean;
  showHoldTimer: boolean;
  statusLabel?: string;
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

function getHoldWindow(events: AnalysisSessionRecord["events"], timestampMs: number): { holdActive: boolean; holdElapsedMs: number } {
  const starts = events.filter((event) => event.type === "hold_start" && event.timestampMs <= timestampMs);
  if (starts.length === 0) {
    return { holdActive: false, holdElapsedMs: 0 };
  }

  const activeStart = starts[starts.length - 1];
  const endEvent = events.find((event) => event.type === "hold_end" && event.timestampMs >= activeStart.timestampMs);

  if (endEvent && endEvent.timestampMs <= timestampMs) {
    return { holdActive: false, holdElapsedMs: 0 };
  }

  return {
    holdActive: true,
    holdElapsedMs: Math.max(0, timestampMs - activeStart.timestampMs)
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

  const { holdActive, holdElapsedMs } = getHoldWindow(sortedEvents, clampedTimestamp);

  return {
    timestampMs: clampedTimestamp,
    activePhaseId: getFramePhaseAtTime(sortedFrameSamples, clampedTimestamp),
    repCount: getRepCountAtTime(sortedEvents, clampedTimestamp),
    holdActive,
    holdElapsedMs,
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

  return {
    ...base,
    phaseLabel: base.activePhaseId ?? phaseFromEvents,
    measurementType,
    showRepCount: measurementType === "rep" || measurementType === "hybrid",
    showHoldTimer: measurementType === "hold" || measurementType === "hybrid",
    statusLabel: session.debug?.noEventCause === "low_confidence_frames" ? "Low confidence" : undefined
  };
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
