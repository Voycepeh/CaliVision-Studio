import type { LiveSessionTrace } from "./types";

export const LIVE_TRACE_MIN_FRESH_SAMPLES = 2;

function buildFrameFingerprint(joints: Record<string, { x: number; y: number } | undefined>): string {
  const entries = Object.entries(joints)
    .filter(([, point]) => point)
    .slice(0, 8)
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
  uniqueFingerprintCount: number;
  hasSufficientFreshness: boolean;
} {
  const sampleCount = trace.captures.length;
  const uniqueTimestamps = new Set<number>();
  const uniqueFingerprints = new Set<string>();

  for (const capture of trace.captures) {
    uniqueTimestamps.add(capture.timestampMs);
    uniqueFingerprints.add(buildFrameFingerprint(capture.frame.joints));
  }

  const uniqueTimestampCount = uniqueTimestamps.size;
  const uniqueFingerprintCount = uniqueFingerprints.size;
  const hasSufficientFreshness =
    sampleCount >= LIVE_TRACE_MIN_FRESH_SAMPLES && uniqueTimestampCount >= LIVE_TRACE_MIN_FRESH_SAMPLES && uniqueFingerprintCount >= LIVE_TRACE_MIN_FRESH_SAMPLES;

  return {
    sampleCount,
    uniqueTimestampCount,
    uniqueFingerprintCount,
    hasSufficientFreshness
  };
}
