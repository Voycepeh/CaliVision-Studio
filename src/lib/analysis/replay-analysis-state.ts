import type { AnalysisEvent } from "../schema/contracts.ts";
import type { AnalysisSessionRecord } from "./session-repository.ts";
import { getReplayDurationMs } from "./replay-state.ts";

type TimelineSegmentLike = {
  startMs: number;
  endMs: number;
};

export type ReplayAnalysisState = {
  timestampMs: number;
  repCount: number;
  holdDurationMs: number;
  repIndex: number;
  currentPhaseId: string | null;
  currentPhaseLabel: string;
  completedRepsLabel: string;
  currentRepProgressLabel: string;
  activeTimelineIndex: number;
};

function clampTimestamp(value: number, durationMs: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.max(0, Math.min(durationMs, Math.round(value)));
}

function getSortedEvents(session?: AnalysisSessionRecord | null): AnalysisEvent[] {
  if (!session) {
    return [];
  }
  return [...session.events]
    .filter((event) => Number.isFinite(event.timestampMs) && event.timestampMs >= 0)
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

function getSortedFrames(session?: AnalysisSessionRecord | null): AnalysisSessionRecord["frameSamples"] {
  if (!session) {
    return [];
  }
  return [...session.frameSamples]
    .filter((frame) => Number.isFinite(frame.timestampMs) && frame.timestampMs >= 0)
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

function normalizeSegments(segments?: TimelineSegmentLike[] | null): TimelineSegmentLike[] {
  if (!segments) {
    return [];
  }
  return segments
    .filter((segment) => Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs))
    .map((segment) => ({
      startMs: Math.max(0, Math.round(segment.startMs)),
      endMs: Math.max(0, Math.round(segment.endMs))
    }))
    .sort((a, b) => a.startMs - b.startMs);
}

export function getActiveTimelineIndexAtTimestamp(
  timestampMs: number,
  segments: TimelineSegmentLike[] | null | undefined,
  durationMs?: number
): number {
  const normalized = normalizeSegments(segments);
  if (normalized.length === 0) {
    return -1;
  }
  const fallbackDuration = Math.max(...normalized.map((segment) => segment.endMs), 0);
  const clamped = clampTimestamp(timestampMs, Math.max(1, durationMs ?? fallbackDuration));
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const segment = normalized[index];
    const segmentEndExclusive = index === normalized.length - 1 ? segment.endMs : Math.max(segment.startMs + 1, segment.endMs);
    if (clamped >= segment.startMs && (clamped < segmentEndExclusive || (index === normalized.length - 1 && clamped <= segment.endMs))) {
      return index;
    }
  }
  return 0;
}

export function getRepCountAtTimestamp(session: AnalysisSessionRecord | null | undefined, timestampMs: number): number {
  const durationMs = getReplayDurationMs(session);
  const clamped = clampTimestamp(timestampMs, durationMs);
  const reps = getSortedEvents(session).filter((event) => event.type === "rep_complete" && event.timestampMs <= clamped);
  if (reps.length === 0) {
    return 0;
  }
  const highestRepIndex = reps.reduce((max, event) => Math.max(max, Number(event.repIndex ?? 0)), 0);
  return Math.max(reps.length, highestRepIndex);
}

export function getRepIndexAtTimestamp(session: AnalysisSessionRecord | null | undefined, timestampMs: number): number {
  return getRepCountAtTimestamp(session, timestampMs);
}

export function getHoldDurationAtTimestamp(session: AnalysisSessionRecord | null | undefined, timestampMs: number): number {
  const durationMs = getReplayDurationMs(session);
  const clamped = clampTimestamp(timestampMs, durationMs);
  const events = getSortedEvents(session);
  if (events.length === 0) {
    const fallback = Math.max(0, Math.round(session?.summary.holdDurationMs ?? 0));
    return Math.min(fallback, clamped);
  }

  let activeHoldStartMs: number | null = null;
  let totalHoldDurationMs = 0;

  for (const event of events) {
    if (event.timestampMs > clamped) {
      break;
    }
    if (event.type === "hold_start" && activeHoldStartMs === null) {
      activeHoldStartMs = event.timestampMs;
      continue;
    }
    if (event.type === "hold_end" && activeHoldStartMs !== null) {
      totalHoldDurationMs += Math.max(0, event.timestampMs - activeHoldStartMs);
      activeHoldStartMs = null;
    }
  }

  if (activeHoldStartMs !== null) {
    totalHoldDurationMs += Math.max(0, clamped - activeHoldStartMs);
  }

  return Math.max(0, Math.min(clamped, Math.round(totalHoldDurationMs)));
}

export function getPhaseAtTimestamp(session: AnalysisSessionRecord | null | undefined, timestampMs: number): string | null {
  const durationMs = getReplayDurationMs(session);
  const clamped = clampTimestamp(timestampMs, durationMs);
  const events = getSortedEvents(session);
  const phaseEvent = events
    .filter((event) => event.type === "phase_enter" && event.phaseId && event.timestampMs <= clamped)
    .at(-1);
  if (phaseEvent?.phaseId) {
    return phaseEvent.phaseId;
  }

  const frames = getSortedFrames(session);
  const frame = frames.filter((sample) => sample.timestampMs <= clamped).at(-1);
  return frame?.classifiedPhaseId ?? null;
}

export function buildReplayAnalysisState(input: {
  session: AnalysisSessionRecord | null | undefined;
  phaseLabelsById?: Record<string, string>;
  timestampMs: number;
  phaseTimelineSegments?: TimelineSegmentLike[];
}): ReplayAnalysisState {
  const durationMs = getReplayDurationMs(input.session);
  const clamped = clampTimestamp(input.timestampMs, durationMs);
  const currentPhaseId = getPhaseAtTimestamp(input.session, clamped);
  const repCount = getRepCountAtTimestamp(input.session, clamped);
  const holdDurationMs = getHoldDurationAtTimestamp(input.session, clamped);
  const currentRepProgressLabel = getCurrentRepProgressAtTimestamp(input.session, clamped);

  return {
    timestampMs: clamped,
    repCount,
    holdDurationMs,
    repIndex: getRepIndexAtTimestamp(input.session, clamped),
    currentPhaseId,
    currentPhaseLabel: currentPhaseId ? (input.phaseLabelsById?.[currentPhaseId] ?? currentPhaseId) : "No phase detected yet",
    completedRepsLabel: `Completed reps so far: ${repCount}`,
    currentRepProgressLabel,
    activeTimelineIndex: getActiveTimelineIndexAtTimestamp(clamped, input.phaseTimelineSegments, durationMs)
  };
}

export function getCurrentRepProgressAtTimestamp(session: AnalysisSessionRecord | null | undefined, timestampMs: number): string {
  const phaseId = getPhaseAtTimestamp(session, timestampMs);
  const repCount = getRepCountAtTimestamp(session, timestampMs);
  if (!phaseId) {
    return `Rep ${repCount + 1}: waiting for first detected phase`;
  }
  return `Rep ${repCount + 1}: currently in ${phaseId}`;
}
