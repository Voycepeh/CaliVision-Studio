import type { LiveSessionTrace } from "./types";

export const LIVE_TRACE_MIN_FRESH_SAMPLES = 12;
export const LIVE_TRACE_MIN_UNIQUE_SOURCE_TIMESTAMPS = 8;
export const LIVE_TRACE_MIN_SOURCE_ADVANCEMENT_MS = 900;
export const LIVE_TRACE_MIN_UNIQUE_FINGERPRINTS = 6;
export const LIVE_TRACE_MAX_REPEATED_SOURCE_RATIO = 0.75;

function buildFrameFingerprint(joints: Record<string, { x: number; y: number } | undefined>): string {
  const entries = Object.entries(joints)
    .filter(([, point]) => point)
    .slice(0, 12)
    .map(([name, point]) => {
      const x = Math.round((point?.x ?? 0) * 1000);
      const y = Math.round((point?.y ?? 0) * 1000);
      return `${name}:${x},${y}`;
    });
  return entries.join("|");
}

export function summarizeLiveTraceFreshness(trace: Pick<LiveSessionTrace, "captures" | "video">): {
  sampleCount: number;
  uniqueTimestampCount: number;
  uniqueSourceTimestampCount: number;
  uniqueFingerprintCount: number;
  sourceTimeAdvancementMs: number;
  repeatedSourceTimestampRatio: number;
  hasSufficientFreshness: boolean;
  failureReasons: string[];
} {
  const sampleCount = trace.captures.length;
  const uniqueTimestamps = new Set<number>();
  const uniqueSourceTimestamps = new Set<number>();
  const uniqueFingerprints = new Set<string>();
  let repeatedSourceSteps = 0;

  const sourceTimestamps = trace.captures.map((capture) => Math.max(0, Math.round(capture.sourceMediaTimeMs ?? capture.timestampMs)));

  for (let i = 0; i < trace.captures.length; i += 1) {
    const capture = trace.captures[i];
    const sourceTimestamp = sourceTimestamps[i];
    uniqueTimestamps.add(capture.timestampMs);
    uniqueSourceTimestamps.add(sourceTimestamp);
    uniqueFingerprints.add(buildFrameFingerprint(capture.frame.joints));
    if (i > 0 && sourceTimestamp === sourceTimestamps[i - 1]) {
      repeatedSourceSteps += 1;
    }
  }

  const sourceMin = sourceTimestamps.length > 0 ? Math.min(...sourceTimestamps) : 0;
  const sourceMax = sourceTimestamps.length > 0 ? Math.max(...sourceTimestamps) : 0;
  const sourceTimeAdvancementMs = Math.max(0, sourceMax - sourceMin);
  const repeatedSourceTimestampRatio = sampleCount > 1 ? repeatedSourceSteps / (sampleCount - 1) : 1;

  const failureReasons: string[] = [];
  if (sampleCount < LIVE_TRACE_MIN_FRESH_SAMPLES) {
    failureReasons.push(`samples=${sampleCount} (<${LIVE_TRACE_MIN_FRESH_SAMPLES})`);
  }
  if (uniqueSourceTimestamps.size < LIVE_TRACE_MIN_UNIQUE_SOURCE_TIMESTAMPS) {
    failureReasons.push(`uniqueSourceTimestamps=${uniqueSourceTimestamps.size} (<${LIVE_TRACE_MIN_UNIQUE_SOURCE_TIMESTAMPS})`);
  }
  if (sourceTimeAdvancementMs < LIVE_TRACE_MIN_SOURCE_ADVANCEMENT_MS) {
    failureReasons.push(`sourceTimeAdvancementMs=${sourceTimeAdvancementMs} (<${LIVE_TRACE_MIN_SOURCE_ADVANCEMENT_MS})`);
  }
  if (uniqueFingerprints.size < LIVE_TRACE_MIN_UNIQUE_FINGERPRINTS) {
    failureReasons.push(`uniqueFrames=${uniqueFingerprints.size} (<${LIVE_TRACE_MIN_UNIQUE_FINGERPRINTS})`);
  }
  if (repeatedSourceTimestampRatio > LIVE_TRACE_MAX_REPEATED_SOURCE_RATIO) {
    failureReasons.push(`repeatedSourceRatio=${repeatedSourceTimestampRatio.toFixed(2)} (> ${LIVE_TRACE_MAX_REPEATED_SOURCE_RATIO})`);
  }

  return {
    sampleCount,
    uniqueTimestampCount: uniqueTimestamps.size,
    uniqueSourceTimestampCount: uniqueSourceTimestamps.size,
    uniqueFingerprintCount: uniqueFingerprints.size,
    sourceTimeAdvancementMs,
    repeatedSourceTimestampRatio,
    hasSufficientFreshness: failureReasons.length === 0,
    failureReasons
  };
}
