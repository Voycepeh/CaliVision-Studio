import assert from "node:assert/strict";
import test from "node:test";

import { projectionInputsChanged, projectionStatsForDiagnostics, shouldRevalidatePreviewSurface, type OverlayProjectionInputs } from "./live-overlay-hot-path.ts";

function makeInputs(): OverlayProjectionInputs {
  return {
    sourceWidth: 1280,
    sourceHeight: 720,
    containerLeft: 10,
    containerTop: 20,
    containerWidth: 800,
    containerHeight: 450,
    videoLeft: 10,
    videoTop: 20,
    videoWidth: 800,
    videoHeight: 450,
    fitMode: "contain",
    mirrored: false
  };
}

test("projectionInputsChanged ignores sub-pixel jitter but detects meaningful layout changes", () => {
  const base = makeInputs();
  const tinyJitter = { ...base, videoLeft: base.videoLeft + 0.2, containerWidth: base.containerWidth + 0.3 };
  const meaningfulShift = { ...base, videoLeft: base.videoLeft + 2 };
  assert.equal(projectionInputsChanged(base, tinyJitter), false);
  assert.equal(projectionInputsChanged(base, meaningfulShift), true);
});

test("shouldRevalidatePreviewSurface prioritizes resize and otherwise throttles checks", () => {
  assert.equal(
    shouldRevalidatePreviewSurface({
      nowMs: 100,
      lastCheckAtMs: 95,
      intervalMs: 120,
      needsResizeSync: true
    }),
    true
  );
  assert.equal(
    shouldRevalidatePreviewSurface({
      nowMs: 200,
      lastCheckAtMs: 120,
      intervalMs: 120,
      needsResizeSync: false
    }),
    false
  );
  assert.equal(
    shouldRevalidatePreviewSurface({
      nowMs: 250,
      lastCheckAtMs: 120,
      intervalMs: 120,
      needsResizeSync: false
    }),
    true
  );
});

test("projectionStatsForDiagnostics returns compact projection summary", () => {
  assert.equal(
    projectionStatsForDiagnostics({
      renderedWidth: 320.2,
      renderedHeight: 179.7,
      offsetX: 12.4,
      offsetY: 240.6,
      mirrored: false,
      rotationDegrees: 0
    }),
    "320x180@(12,241)"
  );
  assert.equal(projectionStatsForDiagnostics(null), "none");
});
