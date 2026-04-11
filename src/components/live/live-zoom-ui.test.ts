import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const liveWorkspaceSource = readFileSync("src/components/live/LiveStreamingWorkspace.tsx", "utf8");

test("0.5x unavailable keeps controls usable without blocking overlay message", () => {
  assert.ok(liveWorkspaceSource.includes("const isDisabled = preset === 0.5 && !halfXAccess.available"));
  assert.ok(!liveWorkspaceSource.includes("zoomStatusMessage ? <div className=\"live-streaming-zoom-unsupported\""));
  assert.ok(liveWorkspaceSource.includes("void handleZoomPresetSelection(preset)"));
});
