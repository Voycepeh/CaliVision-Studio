import type { DetectionResult } from "./types.ts";
import type { PortablePhaseDetectionCrop } from "../schema/contracts.ts";

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 4;

function clampNormalized(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export type DetectionCropRectPx = {
  sx: number;
  sy: number;
  size: number;
};

export function createDefaultDetectionCrop(): PortablePhaseDetectionCrop {
  return {
    centerX: 0.5,
    centerY: 0.5,
    zoom: 1
  };
}

export function computeContainZoomForSquareFrame(sourceWidth: number, sourceHeight: number): number {
  const shortestSide = Math.max(1, Math.min(sourceWidth, sourceHeight));
  const longestSide = Math.max(1, Math.max(sourceWidth, sourceHeight));
  return shortestSide / longestSide;
}

export function normalizeDetectionCrop(
  input: Partial<PortablePhaseDetectionCrop> | null | undefined,
  sourceWidth?: number,
  sourceHeight?: number
): PortablePhaseDetectionCrop {
  return {
    centerX: clampNormalized(input?.centerX ?? 0.5),
    centerY: clampNormalized(input?.centerY ?? 0.5),
    zoom: clampZoom(input?.zoom ?? 1, sourceWidth, sourceHeight)
  };
}

export function clampZoom(value: number, sourceWidth?: number, sourceHeight?: number): number {
  const containMin = sourceWidth && sourceHeight ? computeContainZoomForSquareFrame(sourceWidth, sourceHeight) : MIN_ZOOM;
  const minimumZoom = Math.max(MIN_ZOOM, containMin);
  if (!Number.isFinite(value)) return minimumZoom;
  return Math.max(minimumZoom, Math.min(MAX_ZOOM, value));
}

export function computeDetectionCropRectPx(
  sourceWidth: number,
  sourceHeight: number,
  crop: PortablePhaseDetectionCrop
): DetectionCropRectPx {
  const normalized = normalizeDetectionCrop(crop, sourceWidth, sourceHeight);
  const shortestSide = Math.max(1, Math.min(sourceWidth, sourceHeight));
  const unclampedSize = shortestSide / normalized.zoom;
  const longestSide = Math.max(sourceWidth, sourceHeight);
  const size = Math.max(1, Math.min(longestSide, unclampedSize));
  const centerX = normalized.centerX * sourceWidth;
  const centerY = normalized.centerY * sourceHeight;

  const minSx = Math.min(0, sourceWidth - size);
  const maxSx = Math.max(0, sourceWidth - size);
  const minSy = Math.min(0, sourceHeight - size);
  const maxSy = Math.max(0, sourceHeight - size);

  const sx = Math.min(Math.max(centerX - size / 2, minSx), maxSx);
  const sy = Math.min(Math.max(centerY - size / 2, minSy), maxSy);

  return {
    sx,
    sy,
    size
  };
}

export function clampDetectionCropToImage(
  sourceWidth: number,
  sourceHeight: number,
  crop: Partial<PortablePhaseDetectionCrop> | null | undefined
): PortablePhaseDetectionCrop {
  const normalized = normalizeDetectionCrop(crop, sourceWidth, sourceHeight);
  const rect = computeDetectionCropRectPx(sourceWidth, sourceHeight, normalized);
  const halfSize = rect.size / 2;

  const minCenterX = rect.size <= sourceWidth ? halfSize / sourceWidth : 0;
  const maxCenterX = rect.size <= sourceWidth ? 1 - minCenterX : 1;
  const minCenterY = rect.size <= sourceHeight ? halfSize / sourceHeight : 0;
  const maxCenterY = rect.size <= sourceHeight ? 1 - minCenterY : 1;

  return {
    centerX: Math.min(Math.max(normalized.centerX, minCenterX), maxCenterX),
    centerY: Math.min(Math.max(normalized.centerY, minCenterY), maxCenterY),
    zoom: normalized.zoom
  };
}

export function mapDetectionResultFromCropToSource(
  detection: DetectionResult,
  sourceWidth: number,
  sourceHeight: number,
  cropRect: DetectionCropRectPx
): DetectionResult {
  const joints = Object.fromEntries(
    Object.entries(detection.joints).map(([jointName, joint]) => {
      if (!joint) {
        return [jointName, joint];
      }

      const x = (cropRect.sx + joint.x * cropRect.size) / sourceWidth;
      const y = (cropRect.sy + joint.y * cropRect.size) / sourceHeight;

      return [
        jointName,
        {
          ...joint,
          x: clampNormalized(x),
          y: clampNormalized(y)
        }
      ];
    })
  ) as DetectionResult["joints"];

  return {
    ...detection,
    joints
  };
}
