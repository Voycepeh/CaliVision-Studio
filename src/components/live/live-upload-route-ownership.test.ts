import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("/live keeps a single post-session result surface owner", () => {
  const liveWorkspace = readFileSync("src/components/live/LiveStreamingWorkspace.tsx", "utf8");
  assert.ok(liveWorkspace.includes("live-streaming-results-card"));
  assert.ok(!liveWorkspace.includes("AnalysisViewerShell"));
});

test("/live mounts real-time overlay canvas while session is active", () => {
  const liveWorkspace = readFileSync("src/components/live/LiveStreamingWorkspace.tsx", "utf8");
  assert.ok(liveWorkspace.includes("live-streaming-overlay-canvas"));
  assert.ok(liveWorkspace.includes("isLivePhase ? \"block\" : \"none\""));
});

test("/upload remains the unified result surface owner", () => {
  const uploadWorkspace = readFileSync("src/components/upload/UploadVideoWorkspace.tsx", "utf8");
  assert.ok(uploadWorkspace.includes("AnalysisViewerShell"));
});


test("desktop draw loop falls back to measured container bounds when cached size is stale", () => {
  const liveWorkspace = readFileSync("src/components/live/LiveStreamingWorkspace.tsx", "utf8");
  assert.ok(liveWorkspace.includes("resolvePreviewContainerSize"));
  assert.ok(liveWorkspace.includes("mediaContainerRef.current?.getBoundingClientRect()"));
});

test("mobile live mapping uses rendered video bounds plus object-fit when building overlay projection", () => {
  const liveWorkspace = readFileSync("src/components/live/LiveStreamingWorkspace.tsx", "utf8");
  assert.ok(liveWorkspace.includes("createOverlayProjectionFromLayout"));
  assert.ok(liveWorkspace.includes("window.getComputedStyle(video).objectFit"));
  assert.ok(liveWorkspace.includes("video.getBoundingClientRect()"));
});

test("live overlay canvas visibility is gated by active live session state, not replay state", () => {
  const liveWorkspace = readFileSync("src/components/live/LiveStreamingWorkspace.tsx", "utf8");
  assert.ok(liveWorkspace.includes('isLivePhase ? "block" : "none"'));
  assert.ok(!liveWorkspace.includes('replayState === "live-session-running"'));
});

test("live drill-selected overlay path forwards CoG options to shared drawPoseOverlay", () => {
  const liveWorkspace = readFileSync("src/components/live/LiveStreamingWorkspace.tsx", "utf8");
  assert.ok(liveWorkspace.includes("centerOfGravityOverlayRef"));
  assert.ok(liveWorkspace.includes("centerOfGravity: {"));
  assert.ok(liveWorkspace.includes("mode: selection.mode"));
});

test("upload freestyle/replay overlay path also forwards CoG options to shared drawPoseOverlay", () => {
  const uploadWorkspace = readFileSync("src/components/upload/UploadVideoWorkspace.tsx", "utf8");
  assert.ok(uploadWorkspace.includes("centerOfGravityOverlayRef"));
  assert.ok(uploadWorkspace.includes("centerOfGravity: {"));
  assert.ok(uploadWorkspace.includes("mode: activeJob.drillSelection.mode ?? \"drill\""));
});

test("shared overlay renderer includes CoG draw instrumentation and star draw branch", () => {
  const overlayRenderer = readFileSync("src/lib/upload/overlay.ts", "utf8");
  assert.ok(overlayRenderer.includes("[cog-overlay]"));
  assert.ok(overlayRenderer.includes("draw-star"));
  assert.ok(overlayRenderer.includes("forceRenderInDev"));
});
