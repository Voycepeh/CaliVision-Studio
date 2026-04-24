import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildVisualCoachingFeedback } from "./coaching-feedback.ts";
import type { BenchmarkCoachingFeedback } from "./benchmark-feedback.ts";

const benchmarkFeedback: BenchmarkCoachingFeedback = {
  summary: { label: "Partial benchmark match", description: "Timing missed.", severity: "warning" },
  qualityBucket: "fair",
  findings: [
    { category: "sequence", severity: "success", title: "Phase sequence matched", description: "Order matched.", recommendedAction: "Keep sequence." },
    { category: "timing", severity: "warning", title: "Timing mismatch", description: "Rep timing outside tolerance.", recommendedAction: "Smooth tempo." }
  ],
  topFindings: [],
  nextSteps: ["Retake with full range"]
};

test("benchmark feedback converts into coaching feedback with positives first", () => {
  const output = buildVisualCoachingFeedback({ benchmarkFeedback, replayState: { repCount: 2 } as never });
  assert.equal(output.positives[0]?.title, "Phase sequence matched");
  assert.equal(output.improvements[0]?.title, "Timing mismatch");
  assert.ok(output.primaryIssue);
});

test("hold and rep positives appear only when grounded", () => {
  const hold = buildVisualCoachingFeedback({
    session: { drillMeasurementType: "hold" } as never,
    replayState: { holdCount: 1, maxHoldMs: 2500 } as never
  });
  assert.equal(hold.positives.some((item) => item.id === "hold_completed"), true);
  const rep = buildVisualCoachingFeedback({ replayState: { repCount: 3 } as never });
  assert.equal(rep.positives.some((item) => item.id === "rep_completed"), true);
});

test("missing benchmark fallback is explicit", () => {
  const output = buildVisualCoachingFeedback({ benchmarkFeedback: null });
  assert.match(output.summaryDescription, /No benchmark available/i);
});

test("workspace components do not hard-code handstand golden coaching copy", () => {
  const upload = readFileSync("src/components/upload/UploadVideoWorkspace.tsx", "utf8");
  const live = readFileSync("src/components/live/LiveStreamingWorkspace.tsx", "utf8");
  assert.equal(upload.includes("Bring my hips over my hands until the wall becomes unnecessary."), false);
  assert.equal(live.includes("Bring my hips over my hands until the wall becomes unnecessary."), false);
});
