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

test("skipped intermediate phase emits skipped-required outcome and does not count", () => {
  const progress = createRepSequenceProgress();
  const events = [
    { phaseId: "stand", timestampMs: 100 },
    { phaseId: "flap", timestampMs: 200 },
    { phaseId: "stand", timestampMs: 300 }
  ];
  const steps = events.map((event) =>
    advanceRepSequence({
      sequence,
      event,
      progress,
      minimumRepDurationMs: 0,
      cooldownMs: 0
    })
  );
  const rejected = steps.find((step) => step.kind === "partial_attempt");
  assert.ok(rejected && rejected.kind === "partial_attempt");
  assert.equal(rejected.details.reason, "skipped_required_phase");
  assert.equal(progress.repCount, 0);
  assert.equal(progress.partialAttemptCount, 1);
});

test("abandoned rep emits incomplete outcome and does not count", () => {
  const progress = createRepSequenceProgress();
  const steps = [
    advanceRepSequence({ sequence, event: { phaseId: "stand", timestampMs: 100 }, progress, minimumRepDurationMs: 0, cooldownMs: 0 }),
    advanceRepSequence({ sequence, event: { phaseId: "hands_up", timestampMs: 200 }, progress, minimumRepDurationMs: 0, cooldownMs: 0 }),
    advanceRepSequence({ sequence, event: { phaseId: "stand", timestampMs: 1000 }, progress, minimumRepDurationMs: 0, cooldownMs: 0 })
  ];

  const rejected = steps.find((step) => step.kind === "partial_attempt");
  assert.ok(rejected && rejected.kind === "partial_attempt");
  assert.equal(rejected.details.reason, "abandoned_attempt");
  assert.equal(progress.repCount, 0);
});

test("debounces repeated incomplete outcomes during noisy resets", () => {
  const progress = createRepSequenceProgress();
  const phaseBurst = ["stand", "flap", "stand", "flap", "stand", "flap", "stand"];
  const attempts = phaseBurst.map((phaseId, index) =>
    advanceRepSequence({
      sequence,
      event: { phaseId, timestampMs: index * 80 + 80 },
      progress,
      minimumRepDurationMs: 0,
      cooldownMs: 0
    })
  );
  const rejectedCount = attempts.filter((step) => step.kind === "partial_attempt").length;
  assert.ok(rejectedCount <= 2);
  assert.ok(progress.partialAttemptCount <= 2);
});

test("clean rep after incomplete attempt still counts correctly", () => {
  const progress = createRepSequenceProgress();
  [
    "stand",
    "flap",
    "stand",
    "hands_up",
    "flap",
    "stand"
  ].forEach((phaseId, index) => {
    advanceRepSequence({
      sequence,
      event: { phaseId, timestampMs: (index + 1) * 120 },
      progress,
      minimumRepDurationMs: 0,
      cooldownMs: 0
    });
  });

  assert.equal(progress.partialAttemptCount, 1);
  assert.equal(progress.repCount, 1);
});
