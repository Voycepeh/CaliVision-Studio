import { createOverlayProjection } from "../live/overlay-geometry.ts";

export type AnnotatedExportGeometry = {
  canvasWidth: number;
  canvasHeight: number;
  projection: ReturnType<typeof createOverlayProjection>;
  timelineWidth: number;
  timelineHeight: number;
  timelineMatchesSource: boolean;
};

function sanitizeDimension(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;
}

export function createAnnotatedExportGeometry(input: {
  sourceWidth: number;
  sourceHeight: number;
  timelineWidth: number;
  timelineHeight: number;
}): AnnotatedExportGeometry {
  const canvasWidth = sanitizeDimension(input.sourceWidth);
  const canvasHeight = sanitizeDimension(input.sourceHeight);
  const timelineWidth = sanitizeDimension(input.timelineWidth);
  const timelineHeight = sanitizeDimension(input.timelineHeight);

  return {
    canvasWidth,
    canvasHeight,
    projection: createOverlayProjection({
      viewportWidth: canvasWidth,
      viewportHeight: canvasHeight,
      sourceWidth: canvasWidth,
      sourceHeight: canvasHeight,
      fitMode: "contain",
      mirrored: false
    }),
    timelineWidth,
    timelineHeight,
    timelineMatchesSource: timelineWidth === canvasWidth && timelineHeight === canvasHeight
  };
}
