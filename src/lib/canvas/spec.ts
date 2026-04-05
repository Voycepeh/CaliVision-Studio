import type { PortableCanvasSpec } from "@/lib/schema/contracts";

export const CANONICAL_PORTRAIT_CANVAS_SPEC: PortableCanvasSpec = {
  coordinateSystem: "normalized-2d",
  widthRef: 1000,
  heightRef: 1600,
  view: "front"
};

export function toRenderableCanvasSpec(canvas?: PortableCanvasSpec | null): PortableCanvasSpec {
  if (!canvas) {
    return CANONICAL_PORTRAIT_CANVAS_SPEC;
  }

  return {
    coordinateSystem: "normalized-2d",
    widthRef: canvas.widthRef > 0 ? canvas.widthRef : CANONICAL_PORTRAIT_CANVAS_SPEC.widthRef,
    heightRef: canvas.heightRef > 0 ? canvas.heightRef : CANONICAL_PORTRAIT_CANVAS_SPEC.heightRef,
    view: canvas.view
  };
}
