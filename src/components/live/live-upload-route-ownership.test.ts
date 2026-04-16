import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("/live keeps a single post-session result surface owner", () => {
  const liveWorkspace = readFileSync("src/components/live/LiveStreamingWorkspace.tsx", "utf8");
  assert.ok(liveWorkspace.includes("live-streaming-results-card"));
  assert.ok(liveWorkspace.includes("AnalysisViewerShell"));
  assert.ok(!liveWorkspace.includes("Live keeps a single result-surface owner (legacy live post-session module)"));
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
