import type { PortableCanvasSpec, PortableViewType } from "@/lib/schema/contracts";

export const CANONICAL_PORTRAIT_CANVAS_SPEC: PortableCanvasSpec = {
  coordinateSystem: "normalized-2d",
  widthRef: 1000,
  heightRef: 1600,
  view: "front"
};

export function getCanonicalRenderCanvasSpec(view: PortableViewType = "front"): PortableCanvasSpec {
  return {
    ...CANONICAL_PORTRAIT_CANVAS_SPEC,
    view
  };
}

/**
 * Studio preview rendering always uses the canonical portrait reference.
 * Incoming package canvas metadata is treated as descriptive context only.
 */
export function toRenderableCanvasSpec(canvas?: PortableCanvasSpec | null): PortableCanvasSpec {
  return getCanonicalRenderCanvasSpec(canvas?.view ?? CANONICAL_PORTRAIT_CANVAS_SPEC.view);
}
