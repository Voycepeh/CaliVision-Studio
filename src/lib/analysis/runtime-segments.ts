import type { AnalysisEvent } from "../schema/contracts.ts";
import type { AnalysisSessionRecord } from "./session-repository.ts";

export type RuntimeSegmentSource = "upload" | "live";
export type RuntimeSegmentType = "rep" | "hold";
export type RuntimeSegmentStatus = "completed" | "partial" | "failed";

export type RuntimeRepPhaseTiming = {
  phaseId: string;
  startTimeSec: number;
  endTimeSec: number;
  durationSec: number;
};

export type RuntimeHoldStableWindow = {
  startTimeSec: number;
  endTimeSec: number;
  durationSec: number;
};

export type RuntimeSegmentKeyMetrics = {
  repDurationSec?: number;
  minRepDurationSec?: number;
  holdDurationSec?: number;
  partialAttemptCount?: number;
  invalidTransitionCount?: number;
  detectedPhaseCoverage?: number;
  lowConfidenceFrames?: number;
};

export type RuntimeSegment = {
  segmentId: string;
  drillId: string;
  attemptId?: string;
  sessionId?: string;
  source: RuntimeSegmentSource;
  segmentType: RuntimeSegmentType;
  index: number;
  startTimeSec: number;
  endTimeSec: number;
  durationSec: number;
  status: RuntimeSegmentStatus;
  phaseTimings?: RuntimeRepPhaseTiming[];
  holdStableWindow?: RuntimeHoldStableWindow;
  keyMetrics?: RuntimeSegmentKeyMetrics;
  mainFinding?: string;
  matchScore?: number;
};

type RuntimeSegmentMappingInput = {
  session: Pick<AnalysisSessionRecord, "sessionId" | "drillId" | "sourceKind" | "events" | "summary">;
  source: RuntimeSegmentSource;
  attemptId?: string;
  mainFinding?: string;
};

function toSafeSeconds(valueMs: number): number {
  if (!Number.isFinite(valueMs)) return 0;
  return Math.max(0, valueMs) / 1000;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value)) return undefined;
  return value;
}

function phaseTimingsForWindow(phaseEnterEvents: AnalysisEvent[], startMs: number, endMs: number): RuntimeRepPhaseTiming[] | undefined {
  const inWindow = phaseEnterEvents
    .filter((event) => event.phaseId && event.timestampMs >= startMs && event.timestampMs <= endMs)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  if (inWindow.length === 0) return undefined;

  const timings = inWindow.map((event, index) => {
    const start = Math.max(startMs, event.timestampMs);
    const nextStart = inWindow[index + 1]?.timestampMs;
    const end = Math.max(start, Math.min(endMs, nextStart ?? endMs));
    return {
      phaseId: event.phaseId as string,
      startTimeSec: toSafeSeconds(start),
      endTimeSec: toSafeSeconds(end),
      durationSec: toSafeSeconds(end - start)
    };
  });

  return timings.length > 0 ? timings : undefined;
}

function statusFromPartialAttempt(event: AnalysisEvent): RuntimeSegmentStatus {
  const reason = typeof event.details?.rejectReason === "string"
    ? event.details.rejectReason
    : typeof event.details?.reason === "string"
      ? event.details.reason
      : "";
  if (reason.length > 0) {
    return "failed";
  }
  return "partial";
}

export function mapAnalysisSessionToRuntimeSegments(input: RuntimeSegmentMappingInput): RuntimeSegment[] {
  const sortedEvents = [...input.session.events].sort((a, b) => a.timestampMs - b.timestampMs);
  const phaseEnterEvents = sortedEvents.filter((event) => event.type === "phase_enter" && event.phaseId);

  const segments: RuntimeSegment[] = [];

  const repEvents = sortedEvents.filter((event) => event.type === "rep_complete" || event.type === "partial_attempt");
  let previousRepEndMs = 0;
  let repCounter = 0;
  for (const event of repEvents) {
    repCounter += 1;
    const loopStartMs = toFiniteNumber(event.details?.loopStartTimestampMs);
    const loopEndMs = toFiniteNumber(event.details?.loopEndTimestampMs);
    const explicitRepDurationMs = toFiniteNumber(event.details?.repDurationMs);

    const endMs = Math.max(0, loopEndMs ?? event.timestampMs);
    const startFromDuration = explicitRepDurationMs !== undefined ? endMs - explicitRepDurationMs : undefined;
    const startMs = Math.max(0, loopStartMs ?? startFromDuration ?? previousRepEndMs);
    previousRepEndMs = Math.max(previousRepEndMs, endMs);

    const keyMetrics: RuntimeSegmentKeyMetrics = {
      repDurationSec: explicitRepDurationMs !== undefined ? toSafeSeconds(explicitRepDurationMs) : undefined,
      minRepDurationSec: toFiniteNumber(event.details?.minRepDurationMs) !== undefined
        ? toSafeSeconds(toFiniteNumber(event.details?.minRepDurationMs) as number)
        : undefined,
      partialAttemptCount: toFiniteNumber(input.session.summary.partialAttemptCount),
      invalidTransitionCount: toFiniteNumber(input.session.summary.invalidTransitionCount),
      detectedPhaseCoverage: toFiniteNumber(input.session.summary.detectedPhaseCoverage),
      lowConfidenceFrames: toFiniteNumber(input.session.summary.lowConfidenceFrames)
    };

    segments.push({
      segmentId: `${input.source}_${input.session.sessionId}_rep_${repCounter}`,
      drillId: input.session.drillId,
      attemptId: input.attemptId,
      sessionId: input.session.sessionId,
      source: input.source,
      segmentType: "rep",
      index: event.repIndex ?? repCounter,
      startTimeSec: toSafeSeconds(startMs),
      endTimeSec: toSafeSeconds(endMs),
      durationSec: toSafeSeconds(endMs - startMs),
      status: event.type === "rep_complete" ? "completed" : statusFromPartialAttempt(event),
      phaseTimings: phaseTimingsForWindow(phaseEnterEvents, startMs, endMs),
      keyMetrics,
      mainFinding: input.mainFinding,
      matchScore: toFiniteNumber(event.details?.matchScore) ?? toFiniteNumber(event.details?.matchConfidence)
    });
  }

  const holdStarts = sortedEvents.filter((event) => event.type === "hold_start");
  const holdEnds = sortedEvents.filter((event) => event.type === "hold_end");
  let nextHoldEndIndex = 0;

  for (let index = 0; index < holdStarts.length; index += 1) {
    const start = holdStarts[index];
    while (nextHoldEndIndex < holdEnds.length && holdEnds[nextHoldEndIndex]!.timestampMs < start.timestampMs) {
      nextHoldEndIndex += 1;
    }
    const end = holdEnds[nextHoldEndIndex];
    if (end && end.timestampMs >= start.timestampMs) {
      nextHoldEndIndex += 1;
    }

    const endMs = end ? end.timestampMs : start.timestampMs;
    const durationMs = end
      ? toFiniteNumber(end.details?.durationMs) ?? Math.max(0, endMs - start.timestampMs)
      : 0;
    const qualified = typeof end?.details?.qualified === "boolean" ? end.details.qualified : undefined;

    segments.push({
      segmentId: `${input.source}_${input.session.sessionId}_hold_${index + 1}`,
      drillId: input.session.drillId,
      attemptId: input.attemptId,
      sessionId: input.session.sessionId,
      source: input.source,
      segmentType: "hold",
      index: index + 1,
      startTimeSec: toSafeSeconds(start.timestampMs),
      endTimeSec: toSafeSeconds(endMs),
      durationSec: toSafeSeconds(durationMs),
      status: !end ? "partial" : qualified === false ? "failed" : "completed",
      holdStableWindow: end && qualified !== false
        ? {
            startTimeSec: toSafeSeconds(start.timestampMs),
            endTimeSec: toSafeSeconds(endMs),
            durationSec: toSafeSeconds(durationMs)
          }
        : undefined,
      keyMetrics: {
        holdDurationSec: toSafeSeconds(durationMs),
        partialAttemptCount: toFiniteNumber(input.session.summary.partialAttemptCount),
        invalidTransitionCount: toFiniteNumber(input.session.summary.invalidTransitionCount),
        detectedPhaseCoverage: toFiniteNumber(input.session.summary.detectedPhaseCoverage),
        lowConfidenceFrames: toFiniteNumber(input.session.summary.lowConfidenceFrames)
      },
      mainFinding: input.mainFinding,
      matchScore: toFiniteNumber(end?.details?.matchScore) ?? toFiniteNumber(end?.details?.matchConfidence)
    });
  }

  return segments.sort((a, b) => {
    if (a.startTimeSec !== b.startTimeSec) {
      return a.startTimeSec - b.startTimeSec;
    }
    return a.index - b.index;
  });
}

export function mapUploadAnalysisToRuntimeSegments(input: {
  session: Pick<AnalysisSessionRecord, "sessionId" | "drillId" | "events" | "summary">;
  attemptId?: string;
  mainFinding?: string;
}): RuntimeSegment[] {
  return mapAnalysisSessionToRuntimeSegments({
    session: {
      ...input.session,
      sourceKind: "upload"
    },
    source: "upload",
    attemptId: input.attemptId,
    mainFinding: input.mainFinding
  });
}

export function mapLiveAnalysisToRuntimeSegments(input: {
  session: Pick<AnalysisSessionRecord, "sessionId" | "drillId" | "events" | "summary">;
  attemptId?: string;
  mainFinding?: string;
}): RuntimeSegment[] {
  return mapAnalysisSessionToRuntimeSegments({
    session: {
      ...input.session,
      sourceKind: "live"
    },
    source: "live",
    attemptId: input.attemptId,
    mainFinding: input.mainFinding
  });
}
