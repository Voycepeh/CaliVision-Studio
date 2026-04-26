import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const panelPath = join(process.cwd(), "src/components/studio/detection/DetectionWorkflowPanel.tsx");
const panelSource = readFileSync(panelPath, "utf8");

const statePath = join(process.cwd(), "src/components/studio/StudioState.tsx");
const stateSource = readFileSync(statePath, "utf8");

test("detection workflow panel uses explicit source image and pose reference actions", () => {
  assert.equal(panelSource.includes("Source image"), true);
  assert.equal(panelSource.includes("Clear source image"), true);
  assert.equal(panelSource.includes("Apply as pose reference"), true);
  assert.equal(panelSource.includes("Clear pose reference"), true);
  assert.equal(panelSource.includes("Pose reference saved."), true);
});

test("pose detection workflow no longer claims upload auto-applies pose reference", () => {
  assert.equal(stateSource.includes("Detecting and applying pose..."), false);
  assert.equal(stateSource.includes("Detected pose ready"), true);
  assert.equal(stateSource.includes("clearSelectedPhasePoseReference"), true);
});
