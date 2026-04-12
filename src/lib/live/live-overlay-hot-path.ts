import type { OverlayProjection } from "./overlay-geometry";

export type OverlayProjectionInputs = {
  sourceWidth: number;
  sourceHeight: number;
  containerLeft: number;
  containerTop: number;
  containerWidth: number;
  containerHeight: number;
  videoLeft: number;
  videoTop: number;
  videoWidth: number;
  videoHeight: number;
  fitMode: "cover" | "contain";
  mirrored: boolean;
};

const FLOAT_TOLERANCE = 0.5;

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= FLOAT_TOLERANCE;
}

export function projectionInputsChanged(
  previous: OverlayProjectionInputs | null,
  next: OverlayProjectionInputs
): boolean {
  if (!previous) {
    return true;
  }
  return !(
    previous.sourceWidth === next.sourceWidth &&
    previous.sourceHeight === next.sourceHeight &&
    previous.fitMode === next.fitMode &&
    previous.mirrored === next.mirrored &&
    nearlyEqual(previous.containerLeft, next.containerLeft) &&
    nearlyEqual(previous.containerTop, next.containerTop) &&
    nearlyEqual(previous.containerWidth, next.containerWidth) &&
    nearlyEqual(previous.containerHeight, next.containerHeight) &&
    nearlyEqual(previous.videoLeft, next.videoLeft) &&
    nearlyEqual(previous.videoTop, next.videoTop) &&
    nearlyEqual(previous.videoWidth, next.videoWidth) &&
    nearlyEqual(previous.videoHeight, next.videoHeight)
  );
}

export function shouldRevalidatePreviewSurface(params: {
  nowMs: number;
  lastCheckAtMs: number;
  intervalMs: number;
  needsResizeSync: boolean;
}): boolean {
  if (params.needsResizeSync) {
    return true;
  }
  return params.nowMs - params.lastCheckAtMs >= params.intervalMs;
}

export function projectionStatsForDiagnostics(projection: OverlayProjection | null): string {
  if (!projection) {
    return "none";
  }
  return `${Math.round(projection.renderedWidth)}x${Math.round(projection.renderedHeight)}@(${Math.round(projection.offsetX)},${Math.round(projection.offsetY)})`;
}
