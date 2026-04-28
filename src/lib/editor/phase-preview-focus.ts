export type PreviewFocusState = {
  centerX: number;
  centerY: number;
  zoom: number;
};

const LANDSCAPE_FRAME_ASPECT = 16 / 9;
const MAX_FOCUS_ZOOM = 3.2;

export function computeContainFocusZoom(sourceWidth: number, sourceHeight: number): number {
  if (sourceWidth <= 0 || sourceHeight <= 0) return 1;
  const sourceAspect = sourceWidth / sourceHeight;
  return sourceAspect >= LANDSCAPE_FRAME_ASPECT ? 1 : sourceAspect / LANDSCAPE_FRAME_ASPECT;
}

export function clampFocusZoom(zoom: number, sourceWidth: number, sourceHeight: number): number {
  const minZoom = computeContainFocusZoom(sourceWidth, sourceHeight);
  if (!Number.isFinite(zoom)) return minZoom;
  return Math.max(minZoom, Math.min(MAX_FOCUS_ZOOM, zoom));
}

export function clampFocusCenter(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

export function createDefaultPhasePreviewFocus(sourceWidth: number, sourceHeight: number): PreviewFocusState {
  return {
    centerX: 0.5,
    centerY: 0.5,
    zoom: clampFocusZoom(1, sourceWidth, sourceHeight)
  };
}

export function normalizePhasePreviewFocus(
  input: Partial<PreviewFocusState> | null | undefined,
  sourceWidth: number,
  sourceHeight: number
): PreviewFocusState {
  return {
    centerX: clampFocusCenter(input?.centerX ?? 0.5),
    centerY: clampFocusCenter(input?.centerY ?? 0.5),
    zoom: clampFocusZoom(input?.zoom ?? 1, sourceWidth, sourceHeight)
  };
}
