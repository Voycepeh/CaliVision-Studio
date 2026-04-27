import type { DetectionResult } from "./types.ts";
import type { PortablePhaseDetectionCrop } from "../schema/contracts.ts";

const MIN_ZOOM = 1;
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

export function normalizeDetectionCrop(input: Partial<PortablePhaseDetectionCrop> | null | undefined): PortablePhaseDetectionCrop {
  return {
    centerX: clampNormalized(input?.centerX ?? 0.5),
    centerY: clampNormalized(input?.centerY ?? 0.5),
    zoom: clampZoom(input?.zoom ?? 1)
  };
}

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return MIN_ZOOM;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

export function computeDetectionCropRectPx(
  sourceWidth: number,
  sourceHeight: number,
  crop: PortablePhaseDetectionCrop
): DetectionCropRectPx {
  const normalized = normalizeDetectionCrop(crop);
  const shortestSide = Math.max(1, Math.min(sourceWidth, sourceHeight));
  const unclampedSize = shortestSide / normalized.zoom;
  const size = Math.max(1, Math.min(shortestSide, unclampedSize));
  const centerX = normalized.centerX * sourceWidth;
  const centerY = normalized.centerY * sourceHeight;

  const maxSx = Math.max(0, sourceWidth - size);
  const maxSy = Math.max(0, sourceHeight - size);

  const sx = Math.min(Math.max(centerX - size / 2, 0), maxSx);
  const sy = Math.min(Math.max(centerY - size / 2, 0), maxSy);

  return {
    sx,
    sy,
    size
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
