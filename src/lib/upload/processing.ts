import { createPoseLandmarkerForJob, mapLandmarksToPoseFrame } from "@/lib/upload/pose-landmarker";
import { deriveReplayOverlayStateAtTime } from "@/lib/analysis/replay-state";
import type { AnalysisSessionRecord } from "@/lib/analysis/session-repository";
import { drawAnalysisOverlay, drawPoseOverlay, getNearestPoseFrame } from "@/lib/upload/overlay";
import type { PoseTimeline } from "@/lib/upload/types";

export type ProcessVideoOptions = {
  cadenceFps: number;
  signal?: AbortSignal;
  onProgress?: (progress: number, stageLabel: string) => void;
};

const SEEK_EPSILON_SECONDS = 0.001;
const SEEK_TIMEOUT_MS = 2500;
const MIN_TIMESTAMP_STEP_MS = 1;

function createObjectUrl(file: File): string {
  return URL.createObjectURL(file);
}

async function loadVideoElement(file: File): Promise<{ video: HTMLVideoElement; objectUrl: string }> {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;

  const objectUrl = createObjectUrl(file);
  video.src = objectUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Unable to read uploaded video metadata."));
  });

  return { video, objectUrl };
}

async function seekVideo(video: HTMLVideoElement, targetSeconds: number): Promise<void> {
  if (Math.abs(video.currentTime - targetSeconds) <= SEEK_EPSILON_SECONDS) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Video seek timed out during pose sampling."));
    }, SEEK_TIMEOUT_MS);

    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      clearTimeout(timeoutId);
    };

    const onSeeked = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Video seek failed during pose sampling."));
    };

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = targetSeconds;
  });
}

export async function readVideoMetadata(file: File): Promise<{ durationMs?: number; width?: number; height?: number }> {
  try {
    const { video, objectUrl } = await loadVideoElement(file);
    const data = {
      durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined,
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined
    };
    URL.revokeObjectURL(objectUrl);
    return data;
  } catch {
    return {};
  }
}

export async function processVideoFile(file: File, options: ProcessVideoOptions): Promise<PoseTimeline> {
  const cadenceMs = 1000 / options.cadenceFps;
  const poseLandmarker = await createPoseLandmarkerForJob();
  const { video, objectUrl } = await loadVideoElement(file);

  const durationMs = Math.round(video.duration * 1000);
  const frames = [] as PoseTimeline["frames"];
  let lastTimestampMs = -1;

  try {
    options.onProgress?.(0.02, "Sampling frames");

    const sampleCount = Math.max(1, Math.ceil(durationMs / cadenceMs) + 1);
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      if (options.signal?.aborted) {
        throw new DOMException("Processing cancelled", "AbortError");
      }

      const candidateTimestampMs = Math.min(durationMs, Math.round(sampleIndex * cadenceMs));
      const timestampMs = candidateTimestampMs <= lastTimestampMs
        ? Math.min(durationMs, lastTimestampMs + MIN_TIMESTAMP_STEP_MS)
        : candidateTimestampMs;
      if (timestampMs <= lastTimestampMs) {
        continue;
      }

      await seekVideo(video, timestampMs / 1000);

      const result = poseLandmarker.detectForVideo(video, timestampMs);
      lastTimestampMs = timestampMs;
      const firstPose = result.landmarks?.[0];
      if (firstPose) {
        frames.push(mapLandmarksToPoseFrame(firstPose, timestampMs));
      }

      const progressRatio = durationMs === 0 ? 0.95 : Math.min(0.95, timestampMs / durationMs);
      options.onProgress?.(progressRatio, `Processing ${Math.round(timestampMs / 1000)}s / ${Math.round(durationMs / 1000)}s`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    options.onProgress?.(1, "Pose timeline complete");

    return {
      schemaVersion: "upload-video-v1",
      detector: "mediapipe-pose-landmarker",
      cadenceFps: options.cadenceFps,
      video: {
        fileName: file.name,
        width: video.videoWidth,
        height: video.videoHeight,
        durationMs,
        sizeBytes: file.size,
        mimeType: file.type
      },
      frames,
      generatedAtIso: new Date().toISOString()
    };
  } catch (error) {
    throw toUserFacingUploadError(error);
  } finally {
    poseLandmarker.close?.();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function exportAnnotatedVideo(
  file: File,
  timeline: PoseTimeline,
  options?: { analysisSession?: AnalysisSessionRecord | null; includeAnalysisOverlay?: boolean }
): Promise<{ blob: Blob; mimeType: string }> {
  const { video, objectUrl } = await loadVideoElement(file);
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("2D canvas context unavailable for annotated export.");
  }

  const stream = canvas.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const completed = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start(250);

  await video.play();

  await new Promise<void>((resolve) => {
    const tick = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const currentMs = video.currentTime * 1000;
      const frame = getNearestPoseFrame(timeline.frames, currentMs);
      drawPoseOverlay(ctx, canvas.width, canvas.height, frame);
      if (options?.includeAnalysisOverlay !== false && options?.analysisSession) {
        drawAnalysisOverlay(
          ctx,
          canvas.width,
          canvas.height,
          deriveReplayOverlayStateAtTime(options.analysisSession, currentMs)
        );
      }

      if (video.ended) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };

    tick();
  });

  recorder.stop();
  const blob = await completed;
  URL.revokeObjectURL(objectUrl);

  return { blob, mimeType };
}

export function buildAnalysisSummary(timeline: PoseTimeline) {
  let confidenceTotal = 0;
  let confidenceCount = 0;

  for (const frame of timeline.frames) {
    for (const joint of Object.values(frame.joints)) {
      if (!joint?.confidence) {
        continue;
      }
      confidenceTotal += joint.confidence;
      confidenceCount += 1;
    }
  }

  return {
    schemaVersion: "upload-analysis-v1" as const,
    averageConfidence: confidenceCount === 0 ? 0 : confidenceTotal / confidenceCount,
    sampledFrameCount: timeline.frames.length,
    durationMs: timeline.video.durationMs
  };
}

function toUserFacingUploadError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error("Upload processing failed.");
  }

  const normalized = error.message.toLowerCase();
  if (normalized.includes("packet timestamp mismatch") || normalized.includes("minimum expected timestamp")) {
    return new Error(
      "Video processing hit a timestamp ordering issue. Please retry this video; Upload Video now starts retries with a fresh local processing context."
    );
  }

  return error;
}
