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
  currentHoldMsAtPlayhead: number;
  detectedHoldMs: number;
  maxHoldMs: number;
  repIndex: number;
  currentPhaseId: string | null;
  currentPhaseLabel: string;
  completedRepsLabel: string;
  currentRepProgressLabel: string;
  activeTimelineIndex: number;
};

type HoldSegment = {
  startMs: number;
  endMs: number | null;
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
  return getHoldMetrics(session, timestampMs).currentHoldMsAtPlayhead;
}

function clampDuration(startMs: number, endMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return 0;
  }
  return Math.max(0, Math.round(endMs) - Math.round(startMs));
}

function buildPhaseHoldSegments(events: AnalysisEvent[], durationMs: number, targetPhaseId: string): HoldSegment[] {
  const segments: HoldSegment[] = [];
  let active: HoldSegment | null = null;

  for (const event of events) {
    if (event.type === "phase_enter" && event.phaseId === targetPhaseId) {
      if (active?.startMs !== undefined) {
        active.endMs = event.timestampMs;
        segments.push(active);
      }
      active = { startMs: event.timestampMs, endMs: null };
      continue;
    }
    if (event.type === "phase_exit" && active !== null && event.phaseId === targetPhaseId) {
      active.endMs = event.timestampMs;
      segments.push(active);
      active = null;
    }
  }

  if (active !== null) {
    segments.push(active);
  }

  return segments
    .map((segment) => ({
      startMs: Math.max(0, Math.round(segment.startMs)),
      endMs: segment.endMs === null ? null : Math.max(0, Math.min(durationMs, Math.round(segment.endMs)))
    }))
    .filter((segment) => segment.startMs <= durationMs);
}

function buildEventHoldSegments(events: AnalysisEvent[], durationMs: number): HoldSegment[] {
  const segments: HoldSegment[] = [];
  let activeStartMs: number | null = null;

  for (const event of events) {
    if (event.type === "hold_start" && activeStartMs === null) {
      activeStartMs = event.timestampMs;
      continue;
    }
    if (event.type === "hold_end" && activeStartMs !== null) {
      segments.push({
        startMs: Math.max(0, Math.round(activeStartMs)),
        endMs: Math.max(0, Math.min(durationMs, Math.round(event.timestampMs)))
      });
      activeStartMs = null;
    }
  }

  if (activeStartMs !== null) {
    segments.push({ startMs: Math.max(0, Math.round(activeStartMs)), endMs: null });
  }

  return segments.filter((segment) => segment.startMs <= durationMs);
}

function resolveSinglePhaseHoldFallbackTarget(
  session: AnalysisSessionRecord | null | undefined,
  events: AnalysisEvent[]
): string | null {
  if (session?.drillMeasurementType !== "hold") {
    return null;
  }
  const phaseIds = new Set(
    events
      .filter((event) => (event.type === "phase_enter" || event.type === "phase_exit") && event.phaseId)
      .map((event) => event.phaseId as string)
  );
  if (phaseIds.size !== 1) {
    return null;
  }
  return phaseIds.values().next().value ?? null;
}

export function getHoldMetrics(
  session: AnalysisSessionRecord | null | undefined,
  timestampMs: number
): { currentHoldMsAtPlayhead: number; detectedHoldMs: number; maxHoldMs: number } {
  const durationMs = getReplayDurationMs(session);
  const clamped = clampTimestamp(timestampMs, durationMs);
  const events = getSortedEvents(session);
  if (events.length === 0) {
    const fallback = Math.max(0, Math.round(session?.summary.holdDurationMs ?? 0));
    return {
      currentHoldMsAtPlayhead: Math.min(fallback, clamped),
      detectedHoldMs: fallback,
      maxHoldMs: fallback
    };
  }

  const explicitSegments = buildEventHoldSegments(events, durationMs);
  const fallbackTargetPhaseId = explicitSegments.length === 0 ? resolveSinglePhaseHoldFallbackTarget(session, events) : null;
  const fallbackPhaseSegments = fallbackTargetPhaseId ? buildPhaseHoldSegments(events, durationMs, fallbackTargetPhaseId) : [];
  const segments = [...explicitSegments, ...fallbackPhaseSegments].sort((a, b) => a.startMs - b.startMs);

  if (segments.length === 0) {
    const fallback = Math.max(0, Math.round(session?.summary.holdDurationMs ?? 0));
    return {
      currentHoldMsAtPlayhead: Math.min(fallback, clamped),
      detectedHoldMs: fallback,
      maxHoldMs: fallback
    };
  }

  let currentHoldMsAtPlayhead = 0;
  let detectedHoldMs = 0;
  let maxHoldMs = 0;

  for (const segment of segments) {
    const boundedEnd = segment.endMs === null ? durationMs : segment.endMs;
    const segmentDurationMs = clampDuration(segment.startMs, boundedEnd);
    detectedHoldMs += segmentDurationMs;
    maxHoldMs = Math.max(maxHoldMs, segmentDurationMs);
    const isActiveAtPlayhead = clamped >= segment.startMs && (segment.endMs === null ? clamped <= durationMs : clamped < segment.endMs);
    if (isActiveAtPlayhead) {
      const activeEnd = segment.endMs === null ? clamped : Math.min(clamped, segment.endMs);
      currentHoldMsAtPlayhead = Math.max(currentHoldMsAtPlayhead, clampDuration(segment.startMs, activeEnd));
    }
  }

  return {
    currentHoldMsAtPlayhead: Math.max(0, currentHoldMsAtPlayhead),
    detectedHoldMs: Math.max(0, detectedHoldMs),
    maxHoldMs: Math.max(0, maxHoldMs)
  };
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
  const holdMetrics = getHoldMetrics(input.session, clamped);
  const currentRepProgressLabel = getCurrentRepProgressAtTimestamp(input.session, clamped);

  return {
    timestampMs: clamped,
    repCount,
    holdDurationMs: holdMetrics.currentHoldMsAtPlayhead,
    currentHoldMsAtPlayhead: holdMetrics.currentHoldMsAtPlayhead,
    detectedHoldMs: holdMetrics.detectedHoldMs,
    maxHoldMs: holdMetrics.maxHoldMs,
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
