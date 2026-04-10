import { createVideoProjection } from "../video/projection.ts";

export type VideoContainRectInput = {
  containerWidth: number;
  containerHeight: number;
  videoWidth: number;
  videoHeight: number;
};

export type VideoContainRect = {
  renderedWidth: number;
  renderedHeight: number;
  offsetX: number;
  offsetY: number;
};

/**
 * Fits an intrinsic video frame into a container with CSS object-fit: contain behavior.
 * Returns the actual rendered video rectangle (size + offsets) inside that container.
 */
export function fitVideoContainRect(input: VideoContainRectInput): VideoContainRect {
  const projection = createVideoProjection({
    sourceWidth: input.videoWidth,
    sourceHeight: input.videoHeight,
    viewportWidth: input.containerWidth,
    viewportHeight: input.containerHeight,
    fitMode: "contain"
  });
  return {
    renderedWidth: projection.renderedRect.width,
    renderedHeight: projection.renderedRect.height,
    offsetX: projection.renderedRect.x,
    offsetY: projection.renderedRect.y
  };
}
