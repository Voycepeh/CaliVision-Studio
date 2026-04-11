import test from "node:test";
import assert from "node:assert/strict";
import { advanceRepSequence, createRepSequenceProgress } from "./rep-sequence-engine.ts";

const sequence = ["stand", "hands_up", "flap", "stand"];

function runPhases(phases: string[]): ReturnType<typeof createRepSequenceProgress> {
  const progress = createRepSequenceProgress();
  let timestampMs = 0;
  for (const phaseId of phases) {
    timestampMs += 100;
    advanceRepSequence({
      sequence,
      event: { timestampMs, phaseId },
      progress,
      minimumRepDurationMs: 0,
      cooldownMs: 0
    });
  }
  return progress;
}

test("counts rep on clean ordered phase cycle", () => {
  const progress = runPhases(["stand", "hands_up", "flap", "stand"]);
  assert.equal(progress.repCount, 1);
  assert.equal(progress.partialAttemptCount, 0);
});

test("duplicate same-phase entries do not reset sequence progress", () => {
  const progress = runPhases(["stand", "hands_up", "hands_up", "flap", "stand"]);
  assert.equal(progress.repCount, 1);
  assert.equal(progress.partialAttemptCount, 0);
});

test("brief adjacent flicker does not wipe progress", () => {
  const progress = runPhases(["stand", "hands_up", "flap", "hands_up", "flap", "stand"]);
  assert.equal(progress.repCount, 1);
  assert.equal(progress.partialAttemptCount, 0);
});

test("cycle completion tolerates delayed return to phase 1", () => {
  const progress = runPhases(["stand", "hands_up", "flap", "flap", "stand"]);
  assert.equal(progress.repCount, 1);
  assert.equal(progress.partialAttemptCount, 0);
});

test("wrong-order transitions do not create reps", () => {
  const progress = runPhases(["stand", "flap", "hands_up", "stand"]);
  assert.equal(progress.repCount, 0);
  assert.ok(progress.partialAttemptCount >= 1);
});
