import assert from "node:assert/strict";
import test from "node:test";
import { createOverlayProjection, createOverlayProjectionFromLayout, fitVideoCoverRect, isPreviewSurfaceReady, projectNormalizedPoint, resolveOverlayCanvasSize, resolvePreviewContainerSize } from "./overlay-geometry.ts";

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

test("createOverlayProjection remaps cover crop for portrait/landscape and fullscreen viewport changes", () => {
  const portraitProjection = createOverlayProjection({
    viewportWidth: 360,
    viewportHeight: 640,
    sourceWidth: 1920,
    sourceHeight: 1080,
    fitMode: "cover",
    mirrored: false
  });
  assert.equal(portraitProjection.offsetX < 0, true);
  assert.equal(portraitProjection.offsetY, 0);

  const landscapeProjection = createOverlayProjection({
    viewportWidth: 640,
    viewportHeight: 360,
    sourceWidth: 1920,
    sourceHeight: 1080,
    fitMode: "cover",
    mirrored: false
  });
  assert.equal(landscapeProjection.offsetX, 0);
  assert.equal(landscapeProjection.offsetY, 0);

  const fullscreenProjection = createOverlayProjection({
    viewportWidth: 1080,
    viewportHeight: 1920,
    sourceWidth: 1920,
    sourceHeight: 1080,
    fitMode: "cover",
    mirrored: false
  });
  assert.equal(fullscreenProjection.renderedHeight, 1920);
  assert.equal(fullscreenProjection.offsetX < 0, true);
});

test("createOverlayProjection flips x projection when camera changes between rear and front", () => {
  const rear = createOverlayProjection({
    viewportWidth: 400,
    viewportHeight: 700,
    sourceWidth: 1080,
    sourceHeight: 1920,
    mirrored: false
  });
  const front = createOverlayProjection({
    viewportWidth: 400,
    viewportHeight: 700,
    sourceWidth: 1080,
    sourceHeight: 1920,
    mirrored: true
  });

  const samplePoint = { x: 0.1, y: 0.5 };
  const rearProjected = projectNormalizedPoint(samplePoint, rear);
  const frontProjected = projectNormalizedPoint(samplePoint, front);
  assert.equal(Math.round(rearProjected.y), Math.round(frontProjected.y));
  assert.equal(Math.round(rearProjected.x + frontProjected.x), Math.round(rear.offsetX * 2 + rear.renderedWidth));
});

test("createOverlayProjectionFromLayout keeps mapping aligned to rendered video bounds inside the live container", () => {
  const projection = createOverlayProjectionFromLayout({
    sourceWidth: 1920,
    sourceHeight: 1080,
    containerRect: { left: 10, top: 20, width: 360, height: 640 },
    videoRect: { left: 20, top: 60, width: 320, height: 560 },
    fitMode: "contain",
    mirrored: false
  });
  assert.equal(projection.offsetX, 10);
  assert.equal(projection.offsetY, 230);
  assert.equal(projection.renderedWidth, 320);
  assert.equal(projection.renderedHeight, 180);
});


test("resolvePreviewContainerSize falls back to live DOM bounds when cached ResizeObserver size is zero", () => {
  const fromCache = resolvePreviewContainerSize({
    cachedWidth: 640,
    cachedHeight: 360,
    measuredWidth: 800,
    measuredHeight: 450
  });
  assert.deepEqual(fromCache, { width: 640, height: 360 });

  const fromMeasured = resolvePreviewContainerSize({
    cachedWidth: 0,
    cachedHeight: 0,
    measuredWidth: 800,
    measuredHeight: 450
  });
  assert.deepEqual(fromMeasured, { width: 800, height: 450 });
});
