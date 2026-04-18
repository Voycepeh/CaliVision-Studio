import type { AnalysisEvent } from "../schema/contracts.ts";
import type { AnalysisSessionRecord } from "./session-repository.ts";
import { getReplayDurationMs } from "./replay-state.ts";

export type ReplayAnalysisState = {
  timestampMs: number;
  repCount: number;
  holdDurationMs: number;
  repIndex: number;
  currentPhaseId: string | null;
  currentPhaseLabel: string;
  completedRepsLabel: string;
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
  const holdStarts = events.filter((event) => event.type === "hold_start" && event.timestampMs <= clamped);
  if (holdStarts.length === 0) {
    return 0;
  }
  const activeHoldStart = holdStarts.at(-1);
  if (!activeHoldStart) {
    return 0;
  }
  const holdEnd = events.find(
    (event) => event.type === "hold_end" && event.timestampMs >= activeHoldStart.timestampMs
  );
  if (!holdEnd || holdEnd.timestampMs > clamped) {
    return Math.max(0, clamped - activeHoldStart.timestampMs);
  }
  return 0;
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
}): ReplayAnalysisState {
  const durationMs = getReplayDurationMs(input.session);
  const clamped = clampTimestamp(input.timestampMs, durationMs);
  const currentPhaseId = getPhaseAtTimestamp(input.session, clamped);
  const repCount = getRepCountAtTimestamp(input.session, clamped);
  const holdDurationMs = getHoldDurationAtTimestamp(input.session, clamped);

  return {
    timestampMs: clamped,
    repCount,
    holdDurationMs,
    repIndex: getRepIndexAtTimestamp(input.session, clamped),
    currentPhaseId,
    currentPhaseLabel: currentPhaseId ? (input.phaseLabelsById?.[currentPhaseId] ?? currentPhaseId) : "No phase detected yet",
    completedRepsLabel: `Completed reps so far: ${repCount}`
  };
}
