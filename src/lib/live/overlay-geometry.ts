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
};

export function fitVideoCoverRect(input: VideoCoverRectInput): VideoCoverRect {
  const containerWidth = Number.isFinite(input.containerWidth) ? Math.max(0, input.containerWidth) : 0;
  const containerHeight = Number.isFinite(input.containerHeight) ? Math.max(0, input.containerHeight) : 0;
  const videoWidth = Number.isFinite(input.videoWidth) ? Math.max(0, input.videoWidth) : 0;
  const videoHeight = Number.isFinite(input.videoHeight) ? Math.max(0, input.videoHeight) : 0;

  if (containerWidth === 0 || containerHeight === 0 || videoWidth === 0 || videoHeight === 0) {
    return { renderedWidth: containerWidth, renderedHeight: containerHeight, offsetX: 0, offsetY: 0 };
  }

  const scale = Math.max(containerWidth / videoWidth, containerHeight / videoHeight);
  const renderedWidth = videoWidth * scale;
  const renderedHeight = videoHeight * scale;

  return {
    renderedWidth,
    renderedHeight,
    offsetX: (containerWidth - renderedWidth) / 2,
    offsetY: (containerHeight - renderedHeight) / 2
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
  const projectedX = projection.mirrored ? 1 - point.x : point.x;
  return {
    x: projection.offsetX + projectedX * projection.renderedWidth,
    y: projection.offsetY + point.y * projection.renderedHeight
  };
}
