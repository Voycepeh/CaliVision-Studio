import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const uploadWorkspaceSource = readFileSync(new URL("./UploadVideoWorkspace.tsx", import.meta.url), "utf8");

test("freestyle and drill modes share the same pose overlay draw path", () => {
  const drawPoseCallIndex = uploadWorkspaceSource.indexOf("drawPoseOverlay(ctx, containerWidth, containerHeight, frame");
  assert.ok(drawPoseCallIndex >= 0, "expected Upload workspace drawPoseOverlay call");

  const drillModeBranchIndex = uploadWorkspaceSource.indexOf("(activeJob.drillSelection.mode ?? \"drill\") === \"drill\"");
  assert.ok(drillModeBranchIndex >= 0, "expected drill mode branch in Upload workspace");

  assert.ok(
    drawPoseCallIndex < drillModeBranchIndex,
    "pose + CoG overlay draw should happen before drill/freestyle branch so freestyle still renders CoG"
  );
});
