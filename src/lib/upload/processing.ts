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

type SourceKind = "original" | "normalized";

type VideoDiagnostics = {
  width?: number;
  height?: number;
  durationMs?: number;
  fps?: number;
  codec?: string;
  rotationMetadata?: number | "unknown";
  colorTransfer?: string;
  isHdrSource?: boolean;
  hasSuspiciousMetadata: boolean;
};

export type ProcessVideoResult = {
  timeline: PoseTimeline;
  analysisFile: File;
  analysisSourceKind: SourceKind;
};

const SEEK_EPSILON_SECONDS = 0.001;
const SEEK_TIMEOUT_MS = 8000;
const INITIAL_READY_TIMEOUT_MS = 8000;
const MIN_TIMESTAMP_STEP_MS = 1;
const UPLOAD_DIAGNOSTICS_PREFIX = "[upload-processing]";

function logUploadEvent(event: string, payload?: Record<string, unknown>): void {
  if (payload) {
    console.info(`${UPLOAD_DIAGNOSTICS_PREFIX} ${event}`, payload);
    return;
  }
  console.info(`${UPLOAD_DIAGNOSTICS_PREFIX} ${event}`);
}

function createObjectUrl(file: File): string {
  return URL.createObjectURL(file);
}

function extractCodecFromMimeType(mimeType: string): string | undefined {
  const match = mimeType.match(/codecs\s*=\s*"?([^";]+)"?/i);
  if (match?.[1]) {
    return match[1].trim();
  }
  if (mimeType.includes("hevc") || mimeType.includes("h265") || mimeType.includes("hvc1") || mimeType.includes("hev1")) {
    return "hevc";
  }
  if (mimeType.includes("avc") || mimeType.includes("h264") || mimeType.includes("avc1")) {
    return "h264";
  }
  return undefined;
}

function inferHdrFromFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("hlg") || lower.includes("hdr") || lower.includes("pq");
}

async function inspectVideoDiagnostics(file: File): Promise<VideoDiagnostics> {
  const { video, objectUrl } = await loadVideoElement(file);
  try {
    const width = video.videoWidth || undefined;
    const height = video.videoHeight || undefined;
    const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined;
    const codec = extractCodecFromMimeType(file.type);
    const inferredHdr = inferHdrFromFileName(file.name) || /hlg|hdr|bt2020|pq/i.test(file.type);
    const hasSuspiciousMetadata = !width || !height || !durationMs || durationMs <= 0;

    return {
      width,
      height,
      durationMs,
      fps: undefined,
      codec,
      rotationMetadata: "unknown",
      colorTransfer: inferredHdr ? "HLG/HDR (inferred)" : undefined,
      isHdrSource: inferredHdr,
      hasSuspiciousMetadata
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function shouldNormalize(file: File, diagnostics: VideoDiagnostics): { required: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const width = diagnostics.width ?? 0;
  const height = diagnostics.height ?? 0;
  const isPortrait = width > 0 && height > 0 && height > width;
  if (isPortrait && diagnostics.rotationMetadata !== undefined) {
    reasons.push("portrait source may carry rotation metadata ambiguity");
  }

  if (diagnostics.isHdrSource) {
    reasons.push("HDR/HLG transfer detected or inferred");
  }

  const codec = diagnostics.codec?.toLowerCase() ?? "";
  if (codec.includes("hevc") || codec.includes("hvc1") || codec.includes("hev1") || codec.includes("h265")) {
    reasons.push("HEVC/H.265 decoder-fragile source");
  }

  if (diagnostics.hasSuspiciousMetadata) {
    reasons.push("suspicious or incomplete metadata");
  }

  if (!file.type) {
    reasons.push("missing mime type metadata");
  }

  return { required: reasons.length > 0, reasons };
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

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    const readyStart = performance.now();
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        const waitedMs = Math.round(performance.now() - readyStart);
        console.debug(
          `${UPLOAD_DIAGNOSTICS_PREFIX} Initial video readiness wait timed out after ${waitedMs}ms (timeout=${INITIAL_READY_TIMEOUT_MS}ms). Continuing with seek sampling.`
        );
        resolve();
      }, INITIAL_READY_TIMEOUT_MS);

      const cleanup = () => {
        video.removeEventListener("canplay", onCanPlay);
        video.removeEventListener("error", onError);
        clearTimeout(timeoutId);
      };

      const onCanPlay = () => {
        cleanup();
        const waitedMs = Math.round(performance.now() - readyStart);
        console.debug(
          `${UPLOAD_DIAGNOSTICS_PREFIX} Initial video readiness reached canplay in ${waitedMs}ms (timeout=${INITIAL_READY_TIMEOUT_MS}ms).`
        );
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error("Unable to prepare uploaded video for sampling."));
      };

      video.addEventListener("canplay", onCanPlay, { once: true });
      video.addEventListener("error", onError, { once: true });
    });
  }

  return { video, objectUrl };
}

function pickNormalizationMimeType(): string {
  const preferred = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  for (const candidate of preferred) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "video/webm";
}

async function normalizeVideoForAnalysis(file: File, diagnostics: VideoDiagnostics, signal?: AbortSignal): Promise<File> {
  const { video, objectUrl } = await loadVideoElement(file);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, diagnostics.width ?? video.videoWidth ?? 1);
    canvas.height = Math.max(1, diagnostics.height ?? video.videoHeight ?? 1);
    const ctx = canvas.getContext("2d", { alpha: false });

    if (!ctx) {
      throw new Error("Video preprocessing failed: 2D canvas unavailable.");
    }

    const stream = canvas.captureStream(30);
    const mimeType = pickNormalizationMimeType();
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    const chunks: BlobPart[] = [];

    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onerror = () => reject(new Error("Video preprocessing failed: recorder error."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    await video.play();
    recorder.start(250);

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener("ended", onEnded);
        video.removeEventListener("error", onVideoError);
      };

      const onEnded = () => {
        cleanup();
        resolve();
      };

      const onVideoError = () => {
        cleanup();
        reject(new Error("Video preprocessing failed: source decode error."));
      };

      const tick = () => {
        if (signal?.aborted) {
          cleanup();
          reject(new DOMException("Processing cancelled", "AbortError"));
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (!video.ended) {
          requestAnimationFrame(tick);
        }
      };

      video.addEventListener("ended", onEnded, { once: true });
      video.addEventListener("error", onVideoError, { once: true });
      tick();
    });

    recorder.stop();
    const blob = await stopped;

    if (blob.size === 0) {
      throw new Error("Video preprocessing failed: output file was empty.");
    }

    const extension = mimeType.includes("mp4") ? "mp4" : "webm";
    const stem = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${stem}.analysis-normalized.${extension}`, {
      type: blob.type,
      lastModified: Date.now()
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function seekVideo(video: HTMLVideoElement, targetSeconds: number): Promise<void> {
  if (Math.abs(video.currentTime - targetSeconds) <= SEEK_EPSILON_SECONDS) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const seekStartedAt = performance.now();
    const timeoutId = setTimeout(() => {
      cleanup();
      const waitedMs = Math.round(performance.now() - seekStartedAt);
      logUploadEvent("ANALYSIS_SEEK_TIMEOUT", {
        targetSeconds,
        waitedMs,
        timeoutMs: SEEK_TIMEOUT_MS
      });
      reject(new Error("Video seek timed out during pose sampling."));
    }, SEEK_TIMEOUT_MS);

    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      clearTimeout(timeoutId);
    };

    const onSeeked = () => {
      cleanup();
      const waitedMs = Math.round(performance.now() - seekStartedAt);
      console.debug(
        `${UPLOAD_DIAGNOSTICS_PREFIX} Seek completed at ${targetSeconds.toFixed(3)}s in ${waitedMs}ms (timeout=${SEEK_TIMEOUT_MS}ms).`
      );
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

export async function processVideoFile(file: File, options: ProcessVideoOptions): Promise<ProcessVideoResult> {
  const diagnostics = await inspectVideoDiagnostics(file);
  logUploadEvent("VIDEO_METADATA_INSPECTED", {
    fileName: file.name,
    width: diagnostics.width,
    height: diagnostics.height,
    rotationMetadata: diagnostics.rotationMetadata,
    durationMs: diagnostics.durationMs,
    fps: diagnostics.fps,
    codec: diagnostics.codec,
    colorTransfer: diagnostics.colorTransfer
  });

  const normalizationDecision = shouldNormalize(file, diagnostics);
  let analysisFile = file;
  let analysisSourceKind: SourceKind = "original";

  if (normalizationDecision.required) {
    logUploadEvent("NORMALIZATION_REQUIRED", {
      fileName: file.name,
      reasons: normalizationDecision.reasons
    });
    logUploadEvent("NORMALIZATION_STARTED", { fileName: file.name });

    try {
      analysisFile = await normalizeVideoForAnalysis(file, diagnostics, options.signal);
      analysisSourceKind = "normalized";
      logUploadEvent("NORMALIZATION_SUCCEEDED", {
        sourceFileName: file.name,
        normalizedFileName: analysisFile.name,
        normalizedMimeType: analysisFile.type,
        normalizedSizeBytes: analysisFile.size
      });
    } catch (error) {
      logUploadEvent("NORMALIZATION_FAILED", {
        fileName: file.name,
        reason: error instanceof Error ? error.message : "unknown"
      });
      const preprocessingError = new Error("Video preprocessing failed");
      (preprocessingError as Error & { cause?: unknown }).cause = error;
      throw preprocessingError;
    }
  }

  logUploadEvent("ANALYSIS_SOURCE_SELECTED", {
    mode: analysisSourceKind,
    selectedFileName: analysisFile.name,
    selectedMimeType: analysisFile.type || "unknown"
  });

  const cadenceMs = 1000 / options.cadenceFps;
  const poseLandmarker = await createPoseLandmarkerForJob();
  const { video, objectUrl } = await loadVideoElement(analysisFile);

  const durationMs = Math.round(video.duration * 1000);
  const frames = [] as PoseTimeline["frames"];
  let lastTimestampMs = -1;

  try {
    options.onProgress?.(0.02, analysisSourceKind === "normalized" ? "Sampling normalized frames" : "Sampling frames");

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
      timeline: {
        schemaVersion: "upload-video-v1",
        detector: "mediapipe-pose-landmarker",
        cadenceFps: options.cadenceFps,
        video: {
          fileName: analysisFile.name,
          width: video.videoWidth,
          height: video.videoHeight,
          durationMs,
          sizeBytes: analysisFile.size,
          mimeType: analysisFile.type || file.type
        },
        frames,
        generatedAtIso: new Date().toISOString()
      },
      analysisFile,
      analysisSourceKind
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
  options?: {
    analysisSession?: AnalysisSessionRecord | null;
    includeAnalysisOverlay?: boolean;
    overlayModeLabel?: string;
    includeDrillMetrics?: boolean;
    overlayConfidenceLabel?: string;
  }
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
          deriveReplayOverlayStateAtTime(options.analysisSession, currentMs),
          {
            modeLabel: options.overlayModeLabel,
            showDrillMetrics: options.includeDrillMetrics,
            confidenceLabel: options.overlayConfidenceLabel
          }
        );
      } else if (options?.includeAnalysisOverlay !== false && options?.overlayModeLabel) {
        drawAnalysisOverlay(ctx, canvas.width, canvas.height, null, {
          modeLabel: options.overlayModeLabel,
          showDrillMetrics: false,
          confidenceLabel: options.overlayConfidenceLabel
        });
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

  if (normalized.includes("video preprocessing failed")) {
    return new Error("Video preprocessing failed");
  }

  return error;
}
