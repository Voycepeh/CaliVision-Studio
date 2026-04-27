import test from "node:test";
import assert from "node:assert/strict";
import { normalizePoseToLandscapePreview, CANONICAL_PREVIEW_HEIGHT, CANONICAL_PREVIEW_WIDTH } from "./preview-normalization.ts";
import type { PortablePose } from "@/lib/schema/contracts";

function createPose(widthRef: number, heightRef: number, x = 0.5, y = 0.5): PortablePose {
  return {
    poseId: "p1",
    timestampMs: 0,
    canvas: { coordinateSystem: "normalized-2d", widthRef, heightRef, view: "front" },
    joints: { nose: { x, y, confidence: 0.9 } }
  };
}

test("portrait source pose maps into canonical 16:9 landscape frame", () => {
  const next = normalizePoseToLandscapePreview(createPose(1080, 1920));
  assert.equal(next.canvas.widthRef, CANONICAL_PREVIEW_WIDTH);
  assert.equal(next.canvas.heightRef, CANONICAL_PREVIEW_HEIGHT);
  assert.ok((next.joints.nose?.x ?? 0) > 0.25);
  assert.ok((next.joints.nose?.x ?? 1) < 0.75);
});

test("landscape source pose remains centered in canonical frame", () => {
  const next = normalizePoseToLandscapePreview(createPose(1920, 1080));
  assert.ok(Math.abs((next.joints.nose?.x ?? 0) - 0.5) < 0.1);
  assert.ok(Math.abs((next.joints.nose?.y ?? 0) - 0.5) < 0.1);
});

test("square source pose maps to landscape with safe padding", () => {
  const next = normalizePoseToLandscapePreview(createPose(1000, 1000));
  assert.ok((next.joints.nose?.x ?? 0) > 0.15);
  assert.ok((next.joints.nose?.x ?? 1) < 0.85);
});

test("crop/focus zoom transforms coordinates before canonical mapping", () => {
  const next = normalizePoseToLandscapePreview(createPose(1080, 1920, 0.2, 0.5), { centerX: 0.2, centerY: 0.5, zoom: 2 });
  assert.ok((next.joints.nose?.x ?? 0) > 0.4);
});

test("old pixel coordinate pose data is normalized instead of crashing", () => {
  const next = normalizePoseToLandscapePreview(createPose(1080, 1920, 640, 1200));
  assert.ok((next.joints.nose?.x ?? 0) <= 1);
  assert.ok((next.joints.nose?.y ?? 0) <= 1);
});


test("missing preview metadata falls back safely without throwing", () => {
  const pose = createPose(0, 0, 0.5, 0.5);
  const next = normalizePoseToLandscapePreview(pose, null);
  assert.equal(next.canvas.widthRef, CANONICAL_PREVIEW_WIDTH);
});

test("canonical normalized pose stays stable across repeated normalization", () => {
  const canonical = createPose(CANONICAL_PREVIEW_WIDTH, CANONICAL_PREVIEW_HEIGHT, 0.41, 0.68);
  const once = normalizePoseToLandscapePreview(canonical, null);
  const twice = normalizePoseToLandscapePreview(once, null);
  assert.equal(twice.joints.nose?.x, once.joints.nose?.x);
  assert.equal(twice.joints.nose?.y, once.joints.nose?.y);
});

test("focused crop clamps coordinates that would otherwise land outside view", () => {
  const next = normalizePoseToLandscapePreview(createPose(1080, 1920, 0.95, 0.95), {
    centerX: 0.2,
    centerY: 0.2,
    zoom: 2.4
  });
  assert.ok((next.joints.nose?.x ?? -1) >= 0);
  assert.ok((next.joints.nose?.x ?? 2) <= 1);
  assert.ok((next.joints.nose?.y ?? -1) >= 0);
  assert.ok((next.joints.nose?.y ?? 2) <= 1);
});
