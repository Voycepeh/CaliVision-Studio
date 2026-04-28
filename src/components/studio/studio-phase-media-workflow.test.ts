import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const panelPath = join(process.cwd(), "src/components/studio/detection/DetectionWorkflowPanel.tsx");
const panelSource = readFileSync(panelPath, "utf8");

const statePath = join(process.cwd(), "src/components/studio/StudioState.tsx");
const stateSource = readFileSync(statePath, "utf8");

test("detection workflow panel uses explicit source image and pose reference actions", () => {
  const centerInspectorSource = readFileSync(join(process.cwd(), "src/components/studio/StudioCenterInspector.tsx"), "utf8");
  assert.equal(panelSource.includes("Source image"), true);
  assert.equal(panelSource.includes("Clear source image"), true);
  assert.equal(panelSource.includes("This crop is only used for pose detection."), true);
  assert.equal(centerInspectorSource.includes("Apply as pose reference"), true);
  assert.equal(centerInspectorSource.includes("Clear pose reference"), true);
  assert.equal(centerInspectorSource.includes("This only changes the saved preview framing, not pose detection."), true);
});

test("pose detection workflow no longer claims upload auto-applies pose reference", () => {
  assert.equal(stateSource.includes("Detecting and applying pose..."), false);
  assert.equal(stateSource.includes("Detected pose ready"), true);
  assert.equal(stateSource.includes("clearSelectedPhasePoseReference"), true);
});
