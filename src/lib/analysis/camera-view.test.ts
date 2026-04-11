import test from "node:test";
import assert from "node:assert/strict";
import { formatCameraViewLabel, normalizeCameraView } from "./camera-view.ts";

test("normalizeCameraView accepts supported aliases", () => {
  assert.equal(normalizeCameraView("FRONT"), "front");
  assert.equal(normalizeCameraView("Side"), "side");
  assert.equal(normalizeCameraView("rear"), "side");
});

test("normalizeCameraView returns null for unsupported values", () => {
  assert.equal(normalizeCameraView("unknown"), null);
  assert.equal(normalizeCameraView(undefined), null);
});

test("formatCameraViewLabel formats camera view for UI chips", () => {
  assert.equal(formatCameraViewLabel("front"), "Front");
  assert.equal(formatCameraViewLabel("side"), "Side");
});
