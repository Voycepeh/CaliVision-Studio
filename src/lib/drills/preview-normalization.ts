import type { PortablePose } from "@/lib/schema/contracts";

export const CANONICAL_PREVIEW_WIDTH = 1600;
export const CANONICAL_PREVIEW_HEIGHT = 900;
const TARGET_ASPECT_RATIO = CANONICAL_PREVIEW_WIDTH / CANONICAL_PREVIEW_HEIGHT;
const PREVIEW_SAFE_PADDING = 0.06;

type PreviewFocusMetadata = {
  centerX?: number;
  centerY?: number;
  zoom?: number;
} | null;

function toSafeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeCoordinate(value: number, reference: number): number {
  // Legacy drills sometimes store raw pixel coordinates; normalize those into 0..1 until migration cleanup.

  if (value <= 1 && value >= 0) return value;
  if (!Number.isFinite(reference) || reference <= 0) return Math.min(Math.max(value, 0), 1);
  return Math.min(Math.max(value / reference, 0), 1);
}

function resolveFocus(input: PreviewFocusMetadata): { centerX: number; centerY: number; zoom: number } {
  const centerX = Math.min(Math.max(toSafeNumber(input?.centerX) ?? 0.5, 0), 1);
  const centerY = Math.min(Math.max(toSafeNumber(input?.centerY) ?? 0.5, 0), 1);
  const zoom = Math.min(Math.max(toSafeNumber(input?.zoom) ?? 1, 1), 4);
  return { centerX, centerY, zoom };
}

function applyFocusTransform(x: number, y: number, focus: { centerX: number; centerY: number; zoom: number }) {
  const windowSpan = 1 / focus.zoom;
  const minX = focus.centerX - windowSpan / 2;
  const minY = focus.centerY - windowSpan / 2;
  return {
    x: (x - minX) / windowSpan,
    y: (y - minY) / windowSpan
  };
}

export function normalizePoseToLandscapePreview(pose: PortablePose, focus: PreviewFocusMetadata = null): PortablePose {
  const sourceWidth = pose.canvas.widthRef > 0 ? pose.canvas.widthRef : CANONICAL_PREVIEW_WIDTH;
  const sourceHeight = pose.canvas.heightRef > 0 ? pose.canvas.heightRef : CANONICAL_PREVIEW_HEIGHT;
  const sourceAspect = sourceWidth / sourceHeight;
  const resolvedFocus = resolveFocus(focus);

  const fit = sourceAspect >= TARGET_ASPECT_RATIO
    ? { offsetX: 0, offsetY: (1 - TARGET_ASPECT_RATIO / sourceAspect) / 2, scaleX: 1, scaleY: TARGET_ASPECT_RATIO / sourceAspect }
    : { offsetX: (1 - sourceAspect / TARGET_ASPECT_RATIO) / 2, offsetY: 0, scaleX: sourceAspect / TARGET_ASPECT_RATIO, scaleY: 1 };

  const nextJoints = Object.fromEntries(
    Object.entries(pose.joints).flatMap(([jointName, point]) => {
      if (!point) return [];
      const baseX = normalizeCoordinate(point.x, sourceWidth);
      const baseY = normalizeCoordinate(point.y, sourceHeight);
      const focused = applyFocusTransform(baseX, baseY, resolvedFocus);
      const fittedX = fit.offsetX + focused.x * fit.scaleX;
      const fittedY = fit.offsetY + focused.y * fit.scaleY;
      return [[jointName, {
        ...point,
        x: PREVIEW_SAFE_PADDING + fittedX * (1 - PREVIEW_SAFE_PADDING * 2),
        y: PREVIEW_SAFE_PADDING + fittedY * (1 - PREVIEW_SAFE_PADDING * 2)
      }]];
    })
  );

  return {
    ...pose,
    canvas: {
      ...pose.canvas,
      widthRef: CANONICAL_PREVIEW_WIDTH,
      heightRef: CANONICAL_PREVIEW_HEIGHT
    },
    joints: nextJoints
  };
}
