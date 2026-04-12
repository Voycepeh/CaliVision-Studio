import test from "node:test";
import assert from "node:assert/strict";

import { formatAnnotatedRenderProgressLabel, parseFrameProgress } from "./progress-status.ts";

test("parseFrameProgress returns numeric current/total from stage label", () => {
  assert.deepEqual(parseFrameProgress("Rendering frames 172/642"), { current: 172, total: 642 });
});

test("parseFrameProgress returns null for non-numeric labels", () => {
  assert.equal(parseFrameProgress("Preparing export…"), null);
});

test("formatAnnotatedRenderProgressLabel formats in-progress current/total text", () => {
  assert.equal(
    formatAnnotatedRenderProgressLabel({ stageLabel: "Rendering frames 172/642", completed: false }),
    "Rendering annotated video… 172/642 frames"
  );
});

test("formatAnnotatedRenderProgressLabel formats completed with final total", () => {
  assert.equal(
    formatAnnotatedRenderProgressLabel({ stageLabel: "Rendering frames 642/642", completed: true }),
    "Annotated video ready. 642/642 frames"
  );
});
