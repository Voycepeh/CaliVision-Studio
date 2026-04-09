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
  const containerWidth = Number.isFinite(input.containerWidth) ? Math.max(0, input.containerWidth) : 0;
  const containerHeight = Number.isFinite(input.containerHeight) ? Math.max(0, input.containerHeight) : 0;
  const videoWidth = Number.isFinite(input.videoWidth) ? Math.max(0, input.videoWidth) : 0;
  const videoHeight = Number.isFinite(input.videoHeight) ? Math.max(0, input.videoHeight) : 0;

  if (containerWidth === 0 || containerHeight === 0 || videoWidth === 0 || videoHeight === 0) {
    return { renderedWidth: containerWidth, renderedHeight: containerHeight, offsetX: 0, offsetY: 0 };
  }

  const scale = Math.min(containerWidth / videoWidth, containerHeight / videoHeight);
  const renderedWidth = videoWidth * scale;
  const renderedHeight = videoHeight * scale;

  return {
    renderedWidth,
    renderedHeight,
    offsetX: (containerWidth - renderedWidth) / 2,
    offsetY: (containerHeight - renderedHeight) / 2
  };
}
