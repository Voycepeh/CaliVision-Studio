import type { PortableCanvasSpec, PortableJointPoint } from "@/lib/schema/contracts";
import { toRenderableCanvasSpec } from "@/lib/canvas/spec";

export type Point2D = {
  x: number;
  y: number;
};

export type CoordinateMappingOptions = {
  clamp?: boolean;
};

export function clampNormalized(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

export function isNormalized(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function normalizedToCanvasPoint(
  point: Point2D,
  canvas: PortableCanvasSpec,
  options: CoordinateMappingOptions = {}
): Point2D {
  const spec = toRenderableCanvasSpec(canvas);
  const x = options.clamp ? clampNormalized(point.x) : point.x;
  const y = options.clamp ? clampNormalized(point.y) : point.y;

  return {
    x: x * spec.widthRef,
    y: y * spec.heightRef
  };
}

export function canvasToNormalizedPoint(
  point: Point2D,
  canvas: PortableCanvasSpec,
  options: CoordinateMappingOptions = {}
): Point2D {
  const spec = toRenderableCanvasSpec(canvas);
  const x = spec.widthRef === 0 ? 0 : point.x / spec.widthRef;
  const y = spec.heightRef === 0 ? 0 : point.y / spec.heightRef;

  if (options.clamp) {
    return {
      x: clampNormalized(x),
      y: clampNormalized(y)
    };
  }

  return { x, y };
}

export function validateJointPoint(point: PortableJointPoint): string[] {
  const warnings: string[] = [];

  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    warnings.push("Joint contains non-finite coordinates.");
    return warnings;
  }

  if (!isNormalized(point.x) || !isNormalized(point.y)) {
    warnings.push("Joint falls outside normalized [0,1] bounds; Studio clamps it for defensive preview rendering.");
  }

  return warnings;
}
