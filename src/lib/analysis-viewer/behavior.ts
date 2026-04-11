import type { ViewerSurface } from "./types";

export function resolveNextSurface(preferred: ViewerSurface, availability: { raw: boolean; annotated: boolean }): ViewerSurface {
  if (preferred === "annotated" && availability.annotated) return "annotated";
  if (preferred === "raw" && availability.raw) return "raw";
  if (availability.annotated) return "annotated";
  return "raw";
}

export function seekVideoToTimestamp(video: HTMLVideoElement | null, timestampMs: number): boolean {
  if (!video || !Number.isFinite(timestampMs)) {
    return false;
  }
  const target = Math.max(0, timestampMs / 1000);
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    return false;
  }
  video.currentTime = Math.min(video.duration, target);
  return true;
}
