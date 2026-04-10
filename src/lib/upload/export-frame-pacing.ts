export type FramePacingStats = {
  duplicatedFrames: number;
  skippedSourceFrames: number;
  averageFrameDeltaMs: number;
};

export function buildDeterministicFrameSchedule(durationMs: number, fps: number): number[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("Export frame schedule rejected: duration must be a finite positive number.");
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error("Export frame schedule rejected: fps must be a finite positive number.");
  }

  const frameDurationMs = 1000 / fps;
  const totalFrames = Math.max(1, Math.floor(durationMs / frameDurationMs) + 1);
  const schedule: number[] = [];
  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
    schedule.push(Math.min(durationMs, Math.round(frameIndex * frameDurationMs)));
  }
  return schedule;
}

export function measureFramePacingStats(
  renderedTimestampsMs: number[],
  sampledSourceFrameIndices: number[]
): FramePacingStats {
  if (renderedTimestampsMs.length <= 1) {
    return {
      duplicatedFrames: 0,
      skippedSourceFrames: 0,
      averageFrameDeltaMs: 0
    };
  }

  let deltaTotalMs = 0;
  for (let index = 1; index < renderedTimestampsMs.length; index += 1) {
    deltaTotalMs += renderedTimestampsMs[index] - renderedTimestampsMs[index - 1];
  }

  let duplicatedFrames = 0;
  let skippedSourceFrames = 0;
  for (let index = 1; index < sampledSourceFrameIndices.length; index += 1) {
    const previous = sampledSourceFrameIndices[index - 1];
    const current = sampledSourceFrameIndices[index];
    if (current === previous) {
      duplicatedFrames += 1;
      continue;
    }
    if (current > previous + 1) {
      skippedSourceFrames += current - previous - 1;
    }
  }

  return {
    duplicatedFrames,
    skippedSourceFrames,
    averageFrameDeltaMs: deltaTotalMs / (renderedTimestampsMs.length - 1)
  };
}
