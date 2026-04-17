import { createOverlayProjection } from "../live/overlay-geometry.ts";
import { createVideoProjection, type VideoFitMode } from "../video/projection.ts";

export type UploadPlaybackProjection = {
  intrinsicWidth: number;
  intrinsicHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  fitMode: VideoFitMode;
  scale: number;
  offsetX: number;
  offsetY: number;
  renderedWidth: number;
  renderedHeight: number;
};

function sanitizeDimension(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function createUploadPlaybackProjection(input: {
  intrinsicWidth: number;
  intrinsicHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  fitMode?: VideoFitMode;
}): UploadPlaybackProjection {
  const intrinsicWidth = sanitizeDimension(input.intrinsicWidth);
  const intrinsicHeight = sanitizeDimension(input.intrinsicHeight);
  const viewportWidth = sanitizeDimension(input.viewportWidth);
  const viewportHeight = sanitizeDimension(input.viewportHeight);
  const fitMode = input.fitMode ?? "contain";

  const projection = createVideoProjection({
    sourceWidth: intrinsicWidth,
    sourceHeight: intrinsicHeight,
    viewportWidth,
    viewportHeight,
    fitMode
  });

  const orientedSourceWidth = intrinsicWidth;
  const scale = orientedSourceWidth > 0 ? projection.renderedRect.width / orientedSourceWidth : 0;

  return {
    intrinsicWidth,
    intrinsicHeight,
    viewportWidth,
    viewportHeight,
    fitMode,
    scale,
    offsetX: projection.renderedRect.x,
    offsetY: projection.renderedRect.y,
    renderedWidth: projection.renderedRect.width,
    renderedHeight: projection.renderedRect.height
  };
}

export function toOverlayProjectionFromUploadPlayback(
  projection: UploadPlaybackProjection
): ReturnType<typeof createOverlayProjection> {
  return createOverlayProjection({
    viewportWidth: projection.viewportWidth,
    viewportHeight: projection.viewportHeight,
    sourceWidth: projection.intrinsicWidth,
    sourceHeight: projection.intrinsicHeight,
    fitMode: projection.fitMode,
    mirrored: false
  });
}
