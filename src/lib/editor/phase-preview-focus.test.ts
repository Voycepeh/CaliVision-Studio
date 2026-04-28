import assert from "node:assert/strict";
import test from "node:test";

import { clampFocusZoom, computeContainFocusZoom, normalizePhasePreviewFocus } from "./phase-preview-focus.ts";

test("focus zoom minimum allows portrait image to fully contain inside 16:9 frame", () => {
  const minZoom = computeContainFocusZoom(1080, 1920);
  assert.ok(Math.abs(minZoom - 0.31640625) < 0.000001);
  assert.equal(clampFocusZoom(0.1, 1080, 1920), minZoom);
});

test("normalizing preview focus does not mutate independent pose joint coordinates", () => {
  const posePoint = { x: 0.42, y: 0.61 };
  const normalizedFocus = normalizePhasePreviewFocus({ centerX: 0.7, centerY: 0.1, zoom: 2.4 }, 1080, 1920);

  assert.deepEqual(posePoint, { x: 0.42, y: 0.61 });
  assert.equal(normalizedFocus.centerX, 0.7);
  assert.equal(normalizedFocus.centerY, 0.1);
  assert.equal(normalizedFocus.zoom, 2.4);
});
