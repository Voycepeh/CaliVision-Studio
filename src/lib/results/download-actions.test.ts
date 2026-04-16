import assert from "node:assert/strict";
import test from "node:test";

import { resolveResultDownloadTargets } from "./download-actions.ts";

test("upload result with all artifacts exposes all download targets", () => {
  assert.deepEqual(
    resolveResultDownloadTargets({
      resultType: "upload",
      hasAnnotatedVideo: true,
      hasRawVideo: true,
      hasProcessingSummary: true,
      hasPoseTimeline: true
    }),
    ["annotated", "raw", "processing_summary", "pose_timeline"]
  );
});

test("live result with all artifacts exposes all download targets", () => {
  assert.deepEqual(
    resolveResultDownloadTargets({
      resultType: "live",
      hasAnnotatedVideo: true,
      hasRawVideo: true,
      hasProcessingSummary: true,
      hasPoseTimeline: true
    }),
    ["annotated", "raw", "processing_summary", "pose_timeline"]
  );
});

test("only available artifacts render download targets", () => {
  assert.deepEqual(
    resolveResultDownloadTargets({
      resultType: "upload",
      hasAnnotatedVideo: false,
      hasRawVideo: true,
      hasProcessingSummary: true,
      hasPoseTimeline: false
    }),
    ["raw", "processing_summary"]
  );
});

test("download target selection does not exclude live by result type", () => {
  assert.deepEqual(
    resolveResultDownloadTargets({
      resultType: "live",
      hasAnnotatedVideo: false,
      hasRawVideo: true,
      hasProcessingSummary: true,
      hasPoseTimeline: true
    }),
    ["raw", "processing_summary", "pose_timeline"]
  );
});
