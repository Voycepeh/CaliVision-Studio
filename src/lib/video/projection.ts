export type VideoFitMode = "contain" | "cover";

export type VideoProjectionInput = {
  sourceWidth: number;
  sourceHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  fitMode?: VideoFitMode;
  mirrorX?: boolean;
  rotationDegrees?: number;
};

export type VideoRenderedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VideoProjection = {
  sourceWidth: number;
  sourceHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  fitMode: VideoFitMode;
  mirrorX: boolean;
  rotationDegrees: 0 | 90 | 180 | 270;
  renderedRect: VideoRenderedRect;
};

function sanitizeDimension(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizeRotationDegrees(value?: number): 0 | 90 | 180 | 270 {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const normalized = ((((Math.round(value ?? 0) % 360) + 360) % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }
  return 0;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function rotateNormalizedPoint(point: { x: number; y: number }, rotationDegrees: 0 | 90 | 180 | 270): { x: number; y: number } {
  if (rotationDegrees === 90) {
    return { x: 1 - point.y, y: point.x };
  }
  if (rotationDegrees === 180) {
    return { x: 1 - point.x, y: 1 - point.y };
  }
  if (rotationDegrees === 270) {
    return { x: point.y, y: 1 - point.x };
  }
  return point;
}

export function createVideoProjection(input: VideoProjectionInput): VideoProjection {
  const sourceWidth = sanitizeDimension(input.sourceWidth);
  const sourceHeight = sanitizeDimension(input.sourceHeight);
  const viewportWidth = sanitizeDimension(input.viewportWidth);
  const viewportHeight = sanitizeDimension(input.viewportHeight);
  const fitMode = input.fitMode ?? "contain";
  const mirrorX = Boolean(input.mirrorX);
  const rotationDegrees = normalizeRotationDegrees(input.rotationDegrees);

  if (sourceWidth === 0 || sourceHeight === 0 || viewportWidth === 0 || viewportHeight === 0) {
    return {
      sourceWidth,
      sourceHeight,
      viewportWidth,
      viewportHeight,
      fitMode,
      mirrorX,
      rotationDegrees,
      renderedRect: {
        x: 0,
        y: 0,
        width: viewportWidth,
        height: viewportHeight
      }
    };
  }

  const isQuarterTurn = rotationDegrees === 90 || rotationDegrees === 270;
  const orientedWidth = isQuarterTurn ? sourceHeight : sourceWidth;
  const orientedHeight = isQuarterTurn ? sourceWidth : sourceHeight;
  const scale = fitMode === "cover"
    ? Math.max(viewportWidth / orientedWidth, viewportHeight / orientedHeight)
    : Math.min(viewportWidth / orientedWidth, viewportHeight / orientedHeight);
  const width = orientedWidth * scale;
  const height = orientedHeight * scale;

  return {
    sourceWidth,
    sourceHeight,
    viewportWidth,
    viewportHeight,
    fitMode,
    mirrorX,
    rotationDegrees,
    renderedRect: {
      x: (viewportWidth - width) / 2,
      y: (viewportHeight - height) / 2,
      width,
      height
    }
  };
}

export function projectNormalizedPointToViewport(
  point: { x: number; y: number },
  projection: VideoProjection
): { x: number; y: number } {
  const clamped = { x: clampUnit(point.x), y: clampUnit(point.y) };
  const rotated = rotateNormalizedPoint(clamped, projection.rotationDegrees);
  const projectedX = projection.mirrorX ? 1 - rotated.x : rotated.x;
  return {
    x: projection.renderedRect.x + projectedX * projection.renderedRect.width,
    y: projection.renderedRect.y + rotated.y * projection.renderedRect.height
  };
}
