import assert from "node:assert/strict";
import test from "node:test";
import { fitVideoCoverRect, isPreviewSurfaceReady, projectNormalizedPoint, resolveOverlayCanvasSize } from "./overlay-geometry.ts";

test("fitVideoCoverRect models CSS object-fit: cover crop offsets", () => {
  const rect = fitVideoCoverRect({
    containerWidth: 360,
    containerHeight: 640,
    videoWidth: 1920,
    videoHeight: 1080
  });

  assert.equal(rect.renderedWidth, 1137.7777777777778);
  assert.equal(rect.renderedHeight, 640);
  assert.equal(rect.offsetX, -388.8888888888889);
  assert.equal(rect.offsetY, 0);
});

test("resolveOverlayCanvasSize uses DPR to scale backing store", () => {
  const size = resolveOverlayCanvasSize({ cssWidth: 360, cssHeight: 640, devicePixelRatio: 3 });
  assert.deepEqual(size, {
    cssWidth: 360,
    cssHeight: 640,
    backingWidth: 1080,
    backingHeight: 1920,
    pixelRatio: 3
  });
});

test("projectNormalizedPoint mirrors x when front camera projection is mirrored", () => {
  const point = projectNormalizedPoint(
    { x: 0.2, y: 0.4 },
    {
      renderedWidth: 500,
      renderedHeight: 1000,
      offsetX: -50,
      offsetY: 20,
      mirrored: true
    }
  );
  assert.equal(point.x, 350);
  assert.equal(point.y, 420);
});

test("isPreviewSurfaceReady rejects uninitialized surfaces", () => {
  assert.equal(
    isPreviewSurfaceReady({
      readyState: 1,
      videoWidth: 1080,
      videoHeight: 1920,
      containerWidth: 360,
      containerHeight: 640,
      canvasWidth: 1080,
      canvasHeight: 1920
    }),
    false
  );
  assert.equal(
    isPreviewSurfaceReady({
      readyState: 2,
      videoWidth: 1080,
      videoHeight: 1920,
      containerWidth: 360,
      containerHeight: 640,
      canvasWidth: 1080,
      canvasHeight: 1920
    }),
    true
  );
});
