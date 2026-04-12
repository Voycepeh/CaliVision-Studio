const MIN_TIMESTAMP_STEP_MS = 1;
const MIN_ABSOLUTE_SAMPLE_FLOOR = 6;
const MIN_SAMPLE_RATIO = 0.35;

export function buildMonotonicSampleTimestamps(durationMs: number, cadenceMs: number, sampleStride: number): number[] {
  const requestedSampleCount = Math.max(1, Math.ceil(durationMs / cadenceMs) + 1);
  const timestamps: number[] = [];
  let lastTimestampMs = -1;
  for (let sampleIndex = 0; sampleIndex < requestedSampleCount; sampleIndex += Math.max(1, sampleStride)) {
    const candidateTimestampMs = Math.min(durationMs, Math.round(sampleIndex * cadenceMs));
    const timestampMs = candidateTimestampMs <= lastTimestampMs
      ? Math.min(durationMs, lastTimestampMs + MIN_TIMESTAMP_STEP_MS)
      : candidateTimestampMs;
    if (timestampMs <= lastTimestampMs) {
      continue;
    }
    timestamps.push(timestampMs);
    lastTimestampMs = timestampMs;
  }
  return timestamps;
}

export function computeMinimumViableSamples(plannedSampleCount: number): number {
  return Math.max(MIN_ABSOLUTE_SAMPLE_FLOOR, Math.ceil(plannedSampleCount * MIN_SAMPLE_RATIO));
}

export function shouldFailSampling(params: {
  successfulSamples: number;
  plannedSampleCount: number;
}): { fail: boolean; minimumViableSampleCount: number } {
  const minimumViableSampleCount = Math.min(params.plannedSampleCount, computeMinimumViableSamples(params.plannedSampleCount));
  return {
    fail: params.successfulSamples < minimumViableSampleCount,
    minimumViableSampleCount
  };
}
