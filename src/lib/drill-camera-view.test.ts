import test from "node:test";
import assert from "node:assert/strict";
import { formatCameraViewLabel, normalizeDrillCameraView, resolveDrillCameraView } from "./drill-camera-view.ts";

test("normalizeDrillCameraView accepts canonical and case-insensitive values", () => {
  assert.equal(normalizeDrillCameraView("front"), "front");
  assert.equal(normalizeDrillCameraView("FRONT"), "front");
  assert.equal(normalizeDrillCameraView("Side"), "side");
  assert.equal(normalizeDrillCameraView("rear"), "front");
  assert.equal(normalizeDrillCameraView("unknown"), null);
});

test("resolveDrillCameraView prefers primaryView and falls back to defaultView", () => {
  assert.deepEqual(
    resolveDrillCameraView({ drillId: "d1", primaryView: "side", defaultView: "front" } as never),
    { cameraView: "side", source: "primaryView" }
  );

  const fallbackToLegacy = resolveDrillCameraView({ drillId: "d2", primaryView: "invalid", defaultView: "SIDE" } as never);
  assert.equal(fallbackToLegacy.cameraView, "side");
  assert.equal(fallbackToLegacy.source, "defaultView");
  assert.match(fallbackToLegacy.warning ?? "", /missing primaryView/i);
});

test("resolveDrillCameraView returns explicit fallback warning when invalid or missing", () => {
  const invalid = resolveDrillCameraView({ drillId: "d3", primaryView: "???" } as never);
  assert.equal(invalid.cameraView, "front");
  assert.equal(invalid.source, "fallback");
  assert.match(invalid.warning ?? "", /falling back to front/i);

  const freestyle = resolveDrillCameraView(null);
  assert.equal(freestyle.cameraView, "front");
  assert.equal(freestyle.source, "fallback");
});

test("formatCameraViewLabel maps to user-facing labels", () => {
  assert.equal(formatCameraViewLabel("front"), "Front");
  assert.equal(formatCameraViewLabel("side"), "Side");
});
