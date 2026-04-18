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
  lastMatchedTimestampMs: number;
  lastPartialAttemptMs: number;
  lastPartialAttemptReason: string | null;
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
        reason:
          | "sequence_reset"
          | "below_minimum_rep_duration"
          | "cooldown_active"
          | "skipped_required_phase"
          | "broken_sequence"
          | "abandoned_attempt";
        expectedPhaseId?: string;
        skippedPhaseId?: string;
        resumedAtPhaseId?: string;
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
    lastRepMs: -Number.MAX_SAFE_INTEGER,
    lastMatchedTimestampMs: -Number.MAX_SAFE_INTEGER,
    lastPartialAttemptMs: -Number.MAX_SAFE_INTEGER,
    lastPartialAttemptReason: null
  };
}

export function advanceRepSequence(input: {
  sequence: string[];
  event: RepSequenceEvent;
  progress: RepSequenceProgress;
  minimumRepDurationMs: number;
  cooldownMs: number;
  allowForwardJump?: boolean;
  partialAttemptDebounceMs?: number;
}): RepSequenceTransition {
  const { sequence, event, progress } = input;
  if (sequence.length < 2) {
    return { kind: "none", progress };
  }

  const enteredIndex = sequence.indexOf(event.phaseId);
  if (enteredIndex < 0) {
    return { kind: "none", progress };
  }
  const partialAttemptDebounceMs = Math.max(0, input.partialAttemptDebounceMs ?? 320);
  const abandonmentGraceMs = Math.max(200, partialAttemptDebounceMs * 2);
  const emitPartialAttempt = (details: NonNullable<Extract<RepSequenceTransition, { kind: "partial_attempt" }>["details"]>) => {
    const duplicateReason = progress.lastPartialAttemptReason === details.reason;
    const withinDebounceWindow = event.timestampMs - progress.lastPartialAttemptMs < partialAttemptDebounceMs;
    if (duplicateReason && withinDebounceWindow) {
      return { kind: "none", progress } as const;
    }
    progress.partialAttemptCount += 1;
    progress.lastPartialAttemptMs = event.timestampMs;
    progress.lastPartialAttemptReason = details.reason;
    return { kind: "partial_attempt", progress, details } as const;
  };

  const exactExpected = sequence[progress.expectedSequenceIndex];
  if (event.phaseId === exactExpected) {
    if (progress.expectedSequenceIndex === 0) {
      progress.cycleStartMs = event.timestampMs;
    }
    progress.lastMatchedSequenceIndex = progress.expectedSequenceIndex;
    progress.lastMatchedTimestampMs = event.timestampMs;
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
        progress.lastPartialAttemptReason = null;
        progress.expectedSequenceIndex = 1;
        progress.lastMatchedSequenceIndex = 0;
        progress.lastMatchedTimestampMs = loopEndTimestampMs;
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

      progress.expectedSequenceIndex = 1;
      progress.lastMatchedSequenceIndex = 0;
      progress.lastMatchedTimestampMs = loopEndTimestampMs;
      progress.cycleStartMs = loopEndTimestampMs;
      return emitPartialAttempt({
        reason: !passesMinDuration ? "below_minimum_rep_duration" : "cooldown_active",
        loopStartTimestampMs,
        loopEndTimestampMs,
        repDurationMs
      });
    }

    return { kind: "none", progress };
  }

  if (
    enteredIndex === progress.lastMatchedSequenceIndex
    || (
      enteredIndex === progress.lastMatchedSequenceIndex - 1
      && (
        event.phaseId !== sequence[0]
        || event.timestampMs - progress.lastMatchedTimestampMs <= abandonmentGraceMs
      )
    )
  ) {
    return { kind: "none", progress };
  }

  if (enteredIndex === 0) {
    if (progress.expectedSequenceIndex > 0) {
      const shouldMarkAbandoned = progress.lastMatchedSequenceIndex > 0;
      progress.expectedSequenceIndex = 1;
      progress.lastMatchedSequenceIndex = 0;
      progress.lastMatchedTimestampMs = event.timestampMs;
      progress.cycleStartMs = event.timestampMs;
      return emitPartialAttempt({
        reason: shouldMarkAbandoned ? "abandoned_attempt" : "sequence_reset",
        resumedAtPhaseId: event.phaseId
      });
    }
    progress.expectedSequenceIndex = 1;
    progress.lastMatchedSequenceIndex = 0;
    progress.lastMatchedTimestampMs = event.timestampMs;
    progress.cycleStartMs = event.timestampMs;
    return { kind: "none", progress };
  }

  if (enteredIndex > progress.expectedSequenceIndex) {
    if (input.allowForwardJump) {
      progress.expectedSequenceIndex = enteredIndex + 1;
      progress.lastMatchedSequenceIndex = enteredIndex;
      progress.lastMatchedTimestampMs = event.timestampMs;
      return { kind: "none", progress };
    }
    if (progress.expectedSequenceIndex > 0) {
      const expectedPhaseId = sequence[progress.expectedSequenceIndex];
      const skippedPhaseId = sequence[Math.min(sequence.length - 2, Math.max(0, progress.expectedSequenceIndex))];
      progress.expectedSequenceIndex = 0;
      progress.lastMatchedSequenceIndex = -1;
      progress.cycleStartMs = null;
      return emitPartialAttempt({
        reason: "skipped_required_phase",
        expectedPhaseId,
        skippedPhaseId,
        resumedAtPhaseId: event.phaseId
      });
    }
    return { kind: "none", progress };
  }

  if (progress.expectedSequenceIndex > 0) {
    progress.expectedSequenceIndex = 0;
    progress.lastMatchedSequenceIndex = -1;
    progress.cycleStartMs = null;
    return emitPartialAttempt({ reason: "broken_sequence", resumedAtPhaseId: event.phaseId });
  }

  return { kind: "none", progress };
}
