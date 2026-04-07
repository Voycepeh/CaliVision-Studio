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

export function getReplayDurationMs(session?: AnalysisSessionRecord | null): number {
  if (!session) {
    return 0;
  }
  const fromSummary = session.summary.analyzedDurationMs ?? 0;
  const fromFrames = session.frameSamples.at(-1)?.timestampMs ?? 0;
  const fromEvents = session.events.at(-1)?.timestampMs ?? 0;
  return Math.max(fromSummary, fromFrames, fromEvents, 0);
}

function getFramePhaseAtTime(session: AnalysisSessionRecord, timestampMs: number): string | null {
  if (session.frameSamples.length === 0) {
    return null;
  }

  let candidate = session.frameSamples[0];
  for (const frame of session.frameSamples) {
    if (frame.timestampMs > timestampMs) {
      break;
    }
    candidate = frame;
  }
  return candidate?.classifiedPhaseId ?? null;
}

function getRepCountAtTime(session: AnalysisSessionRecord, timestampMs: number): number {
  const reps = session.events.filter((event) => event.type === "rep_complete" && event.timestampMs <= timestampMs);
  if (reps.length === 0) {
    return 0;
  }
  const indexedRep = reps.reduce((max, current) => Math.max(max, current.repIndex ?? 0), 0);
  return Math.max(reps.length, indexedRep);
}

function getHoldWindow(session: AnalysisSessionRecord, timestampMs: number): { holdActive: boolean; holdElapsedMs: number } {
  const starts = session.events.filter((event) => event.type === "hold_start" && event.timestampMs <= timestampMs);
  if (starts.length === 0) {
    return { holdActive: false, holdElapsedMs: 0 };
  }

  const activeStart = starts[starts.length - 1];
  const endEvent = session.events.find((event) => event.type === "hold_end" && event.timestampMs >= activeStart.timestampMs);

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

  const durationMs = getReplayDurationMs(session);
  const clampedTimestamp = clamp(timestampMs, 0, durationMs);
  const nearestEvent =
    session.events
      .filter((event) => event.timestampMs <= clampedTimestamp)
      .sort((a, b) => b.timestampMs - a.timestampMs)[0] ?? null;

  const { holdActive, holdElapsedMs } = getHoldWindow(session, clampedTimestamp);

  return {
    timestampMs: clampedTimestamp,
    activePhaseId: getFramePhaseAtTime(session, clampedTimestamp),
    repCount: getRepCountAtTime(session, clampedTimestamp),
    holdActive,
    holdElapsedMs,
    nearestEvent
  };
}

export function deriveReplayMarkers(session: AnalysisSessionRecord | null | undefined): ReplayTimelineMarker[] {
  if (!session) {
    return [];
  }

  return session.events
    .filter((event) => MARKER_TYPES.includes(event.type))
    .sort((a, b) => a.timestampMs - b.timestampMs)
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
  for (const frame of session.frameSamples) {
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
