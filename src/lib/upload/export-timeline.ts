import type { PoseTimeline } from "@/lib/upload/types";

export type ExportTimelineResolution = {
  durationMs: number;
  fps: number;
  frameDurationMs: number;
  totalFrames: number;
  durationSource: "timeline-metadata" | "trace-frames" | "media-metadata";
  fpsSource: "timeline-cadence" | "default";
};

const EXPORT_STABLE_FPS = 15;
const EXPORT_HIGH_FPS = 24;
const EXPORT_MIN_FPS = 12;
const EXPORT_MAX_FPS = EXPORT_HIGH_FPS;

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function resolveDurationMs(timeline: PoseTimeline, mediaDurationMs?: number): { value: number; source: ExportTimelineResolution["durationSource"] } | null {
  if (isFinitePositive(timeline.video.durationMs)) {
    return { value: timeline.video.durationMs, source: "timeline-metadata" };
  }
  const frameTimestamps = timeline.frames.map((frame) => frame.timestampMs).filter(isFinitePositive);
  const maxTimestamp = frameTimestamps.length > 0 ? Math.max(...frameTimestamps) : 0;
  if (isFinitePositive(maxTimestamp)) {
    return { value: maxTimestamp, source: "trace-frames" };
  }
  if (isFinitePositive(mediaDurationMs)) {
    return { value: mediaDurationMs, source: "media-metadata" };
  }
  return null;
}

function resolveExportFps(cadenceFps: unknown): { value: number; source: ExportTimelineResolution["fpsSource"] } {
  if (isFinitePositive(cadenceFps)) {
    const cadenceRounded = Math.round(cadenceFps);
    const targetFps = cadenceRounded >= EXPORT_HIGH_FPS ? EXPORT_HIGH_FPS : EXPORT_STABLE_FPS;
    return {
      value: Math.min(EXPORT_MAX_FPS, Math.max(EXPORT_MIN_FPS, targetFps)),
      source: "timeline-cadence"
    };
  }
  return { value: EXPORT_STABLE_FPS, source: "default" };
}

export function resolveExportTimeline(
  timeline: PoseTimeline,
  options?: { mediaDurationMs?: number }
): ExportTimelineResolution {
  const duration = resolveDurationMs(timeline, options?.mediaDurationMs);
  if (!duration) {
    throw new Error("Annotated export rejected: no finite duration available from timeline metadata, retained trace frames, or media metadata.");
  }

  const fps = resolveExportFps(timeline.cadenceFps);
  const frameDurationMs = 1000 / fps.value;
  if (!Number.isFinite(frameDurationMs) || frameDurationMs <= 0) {
    throw new Error(`Annotated export rejected: invalid frame interval derived from fps=${String(fps.value)}.`);
  }

  const totalFrames = Math.max(1, Math.floor(duration.value / frameDurationMs) + 1);
  if (!Number.isFinite(totalFrames) || totalFrames < 1) {
    throw new Error(
      `Annotated export rejected: invalid finite frame count (durationMs=${String(duration.value)}, fps=${String(fps.value)}, totalFrames=${String(totalFrames)}).`
    );
  }

  return {
    durationMs: duration.value,
    fps: fps.value,
    frameDurationMs,
    totalFrames,
    durationSource: duration.source,
    fpsSource: fps.source
  };
}
