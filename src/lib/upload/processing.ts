import { getPoseLandmarker, mapLandmarksToPoseFrame } from "@/lib/upload/pose-landmarker";
import { drawPoseOverlay, getNearestPoseFrame } from "@/lib/upload/overlay";
import type { PoseTimeline } from "@/lib/upload/types";

export type ProcessVideoOptions = {
  cadenceFps: number;
  signal?: AbortSignal;
  onProgress?: (progress: number, stageLabel: string) => void;
};

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
  const poseLandmarker = await getPoseLandmarker();
  const { video, objectUrl } = await loadVideoElement(file);

  const durationMs = Math.round(video.duration * 1000);
  const frames = [] as PoseTimeline["frames"];

  try {
    options.onProgress?.(0.02, "Sampling frames");

    for (let timestampMs = 0; timestampMs <= durationMs; timestampMs += cadenceMs) {
      if (options.signal?.aborted) {
        throw new DOMException("Processing cancelled", "AbortError");
      }

      video.currentTime = timestampMs / 1000;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });

      const result = poseLandmarker.detectForVideo(video, timestampMs);
      const firstPose = result.landmarks?.[0];
      if (firstPose) {
        frames.push(mapLandmarksToPoseFrame(firstPose, timestampMs));
      }

      options.onProgress?.(Math.min(0.95, timestampMs / durationMs), `Processing ${Math.round(timestampMs / 1000)}s / ${Math.round(durationMs / 1000)}s`);
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
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function exportAnnotatedVideo(file: File, timeline: PoseTimeline): Promise<{ blob: Blob; mimeType: string }> {
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
      const frame = getNearestPoseFrame(timeline.frames, video.currentTime * 1000);
      drawPoseOverlay(ctx, canvas.width, canvas.height, frame);

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
