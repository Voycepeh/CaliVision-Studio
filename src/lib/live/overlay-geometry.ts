import { createVideoProjection, projectNormalizedPointToViewport, type VideoFitMode, type VideoProjection } from "../video/projection.ts";

export type VideoCoverRectInput = {
  containerWidth: number;
  containerHeight: number;
  videoWidth: number;
  videoHeight: number;
};

export type VideoCoverRect = {
  renderedWidth: number;
  renderedHeight: number;
  offsetX: number;
  offsetY: number;
};

export type OverlayCanvasSizeInput = {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio?: number;
};

export type OverlayCanvasSize = {
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  pixelRatio: number;
};

export type OverlayProjection = {
  renderedWidth: number;
  renderedHeight: number;
  offsetX: number;
  offsetY: number;
  mirrored: boolean;
  rotationDegrees?: number;
};

export function fitVideoCoverRect(input: VideoCoverRectInput): VideoCoverRect {
  const projection = createVideoProjection({
    sourceWidth: input.videoWidth,
    sourceHeight: input.videoHeight,
    viewportWidth: input.containerWidth,
    viewportHeight: input.containerHeight,
    fitMode: "cover"
  });
  return {
    renderedWidth: projection.renderedRect.width,
    renderedHeight: projection.renderedRect.height,
    offsetX: projection.renderedRect.x,
    offsetY: projection.renderedRect.y
  };
}

export function createOverlayProjection(input: {
  viewportWidth: number;
  viewportHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  fitMode?: VideoFitMode;
  mirrored?: boolean;
  rotationDegrees?: number;
}): OverlayProjection {
  const projection: VideoProjection = createVideoProjection({
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    fitMode: input.fitMode ?? "cover",
    mirrorX: input.mirrored,
    rotationDegrees: input.rotationDegrees
  });
  return {
    renderedWidth: projection.renderedRect.width,
    renderedHeight: projection.renderedRect.height,
    offsetX: projection.renderedRect.x,
    offsetY: projection.renderedRect.y,
    mirrored: projection.mirrorX,
    rotationDegrees: projection.rotationDegrees
  };
}

export function resolveOverlayCanvasSize(input: OverlayCanvasSizeInput): OverlayCanvasSize {
  const cssWidth = Number.isFinite(input.cssWidth) ? Math.max(1, Math.round(input.cssWidth)) : 1;
  const cssHeight = Number.isFinite(input.cssHeight) ? Math.max(1, Math.round(input.cssHeight)) : 1;
  const pixelRatio = Number.isFinite(input.devicePixelRatio) ? Math.max(1, input.devicePixelRatio ?? 1) : 1;
  return {
    cssWidth,
    cssHeight,
    backingWidth: Math.max(1, Math.round(cssWidth * pixelRatio)),
    backingHeight: Math.max(1, Math.round(cssHeight * pixelRatio)),
    pixelRatio
  };
}


export function resolvePreviewContainerSize(input: {
  cachedWidth: number;
  cachedHeight: number;
  measuredWidth?: number;
  measuredHeight?: number;
}): { width: number; height: number } {
  const cachedWidth = Number.isFinite(input.cachedWidth) ? Math.max(0, input.cachedWidth) : 0;
  const cachedHeight = Number.isFinite(input.cachedHeight) ? Math.max(0, input.cachedHeight) : 0;
  if (cachedWidth > 0 && cachedHeight > 0) {
    return { width: cachedWidth, height: cachedHeight };
  }

  const measuredWidth = Number.isFinite(input.measuredWidth) ? Math.max(0, input.measuredWidth ?? 0) : 0;
  const measuredHeight = Number.isFinite(input.measuredHeight) ? Math.max(0, input.measuredHeight ?? 0) : 0;
  if (measuredWidth > 0 && measuredHeight > 0) {
    return { width: measuredWidth, height: measuredHeight };
  }

  return { width: 0, height: 0 };
}

export function isPreviewSurfaceReady(input: {
  readyState: number;
  videoWidth: number;
  videoHeight: number;
  containerWidth: number;
  containerHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}): boolean {
  const minReadyState = 2; // HTMLMediaElement.HAVE_CURRENT_DATA
  return (
    input.readyState >= minReadyState &&
    input.videoWidth > 0 &&
    input.videoHeight > 0 &&
    input.containerWidth > 0 &&
    input.containerHeight > 0 &&
    input.canvasWidth > 0 &&
    input.canvasHeight > 0
  );
}

export function projectNormalizedPoint(
  point: { x: number; y: number },
  projection: OverlayProjection
): { x: number; y: number } {
  const rotationDegrees = projection.rotationDegrees === 90 || projection.rotationDegrees === 180 || projection.rotationDegrees === 270
    ? projection.rotationDegrees
    : 0;
  const localPoint = projectNormalizedPointToViewport(point, {
    sourceWidth: 1,
    sourceHeight: 1,
    viewportWidth: 1,
    viewportHeight: 1,
    fitMode: "contain",
    mirrorX: projection.mirrored,
    rotationDegrees,
    renderedRect: { x: 0, y: 0, width: 1, height: 1 }
  });
  return {
    x: projection.offsetX + localPoint.x * projection.renderedWidth,
    y: projection.offsetY + localPoint.y * projection.renderedHeight
  };
}
