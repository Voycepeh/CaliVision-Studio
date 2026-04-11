export type RepSequenceEvent = {
  timestampMs: number;
  phaseId: string;
};

export type RepSequenceProgress = {
  expectedSequenceIndex: number;
  cycleStartMs: number | null;
  lastMatchedSequenceIndex: number;
  repCount: number;
  partialAttemptCount: number;
  lastRepMs: number;
};

export type RepSequenceTransition =
  | { kind: "none"; progress: RepSequenceProgress }
  | {
      kind: "rep_complete";
      progress: RepSequenceProgress;
      details: {
        loopStartTimestampMs: number;
        loopEndTimestampMs: number;
        repDurationMs: number;
      };
    }
  | {
      kind: "partial_attempt";
      progress: RepSequenceProgress;
      details: {
        reason: "sequence_reset" | "below_minimum_rep_duration" | "cooldown_active";
        loopStartTimestampMs?: number;
        loopEndTimestampMs?: number;
        repDurationMs?: number;
      };
    };

export function createRepSequenceProgress(): RepSequenceProgress {
  return {
    expectedSequenceIndex: 0,
    cycleStartMs: null,
    lastMatchedSequenceIndex: -1,
    repCount: 0,
    partialAttemptCount: 0,
    lastRepMs: -Number.MAX_SAFE_INTEGER
  };
}

export function advanceRepSequence(input: {
  sequence: string[];
  event: RepSequenceEvent;
  progress: RepSequenceProgress;
  minimumRepDurationMs: number;
  cooldownMs: number;
  allowForwardJump?: boolean;
}): RepSequenceTransition {
  const { sequence, event, progress } = input;
  if (sequence.length < 2) {
    return { kind: "none", progress };
  }

  const enteredIndex = sequence.indexOf(event.phaseId);
  if (enteredIndex < 0) {
    return { kind: "none", progress };
  }

  const exactExpected = sequence[progress.expectedSequenceIndex];
  if (event.phaseId === exactExpected) {
    if (progress.expectedSequenceIndex === 0) {
      progress.cycleStartMs = event.timestampMs;
    }
    progress.lastMatchedSequenceIndex = progress.expectedSequenceIndex;
    progress.expectedSequenceIndex += 1;

    if (progress.expectedSequenceIndex >= sequence.length) {
      const loopStartTimestampMs = progress.cycleStartMs ?? event.timestampMs;
      const loopEndTimestampMs = event.timestampMs;
      const repDurationMs = Math.max(0, loopEndTimestampMs - loopStartTimestampMs);
      const passesMinDuration = repDurationMs >= input.minimumRepDurationMs;
      const outsideCooldown = loopEndTimestampMs - progress.lastRepMs >= input.cooldownMs;

      if (passesMinDuration && outsideCooldown) {
        progress.repCount += 1;
        progress.lastRepMs = loopEndTimestampMs;
        progress.expectedSequenceIndex = 1;
        progress.lastMatchedSequenceIndex = 0;
        progress.cycleStartMs = loopEndTimestampMs;
        return {
          kind: "rep_complete",
          progress,
          details: {
            loopStartTimestampMs,
            loopEndTimestampMs,
            repDurationMs
          }
        };
      }

      progress.partialAttemptCount += 1;
      progress.expectedSequenceIndex = 1;
      progress.lastMatchedSequenceIndex = 0;
      progress.cycleStartMs = loopEndTimestampMs;
      return {
        kind: "partial_attempt",
        progress,
        details: {
          reason: !passesMinDuration ? "below_minimum_rep_duration" : "cooldown_active",
          loopStartTimestampMs,
          loopEndTimestampMs,
          repDurationMs
        }
      };
    }

    return { kind: "none", progress };
  }

  if (enteredIndex === progress.lastMatchedSequenceIndex || enteredIndex === progress.lastMatchedSequenceIndex - 1) {
    return { kind: "none", progress };
  }

  if (enteredIndex === 0) {
    if (progress.expectedSequenceIndex > 0) {
      progress.partialAttemptCount += 1;
      progress.expectedSequenceIndex = 1;
      progress.lastMatchedSequenceIndex = 0;
      progress.cycleStartMs = event.timestampMs;
      return { kind: "partial_attempt", progress, details: { reason: "sequence_reset" } };
    }
    progress.expectedSequenceIndex = 1;
    progress.lastMatchedSequenceIndex = 0;
    progress.cycleStartMs = event.timestampMs;
    return { kind: "none", progress };
  }

  if (enteredIndex > progress.expectedSequenceIndex) {
    if (input.allowForwardJump) {
      progress.expectedSequenceIndex = enteredIndex + 1;
      progress.lastMatchedSequenceIndex = enteredIndex;
      return { kind: "none", progress };
    }
    if (progress.expectedSequenceIndex > 0) {
      progress.partialAttemptCount += 1;
      progress.expectedSequenceIndex = 0;
      progress.lastMatchedSequenceIndex = -1;
      progress.cycleStartMs = null;
      return { kind: "partial_attempt", progress, details: { reason: "sequence_reset" } };
    }
    return { kind: "none", progress };
  }

  if (progress.expectedSequenceIndex > 0) {
    progress.partialAttemptCount += 1;
    progress.expectedSequenceIndex = 0;
    progress.lastMatchedSequenceIndex = -1;
    progress.cycleStartMs = null;
    return { kind: "partial_attempt", progress, details: { reason: "sequence_reset" } };
  }

  return { kind: "none", progress };
}
