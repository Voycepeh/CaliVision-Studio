import { createPoseLandmarkerForJob, mapLandmarksToPoseFrame } from "@/lib/upload/pose-landmarker";
import { buildReplayOverlaySamples, getOverlaySampleAtTime } from "@/lib/analysis/replay-state";
import type { AnalysisSessionRecord } from "@/lib/analysis/session-repository";
import { drawAnalysisOverlay, drawPoseOverlay, getNearestPoseFrame } from "@/lib/upload/overlay";
import { createCenterOfGravityTracker } from "@/lib/workflow/center-of-gravity";
import type { PoseTimeline } from "@/lib/upload/types";
import { createAnnotatedExportGeometry } from "@/lib/upload/annotated-export-geometry";
import { resolveExportTimeline } from "@/lib/upload/export-timeline";
import { selectPreferredCaptureMimeType } from "@/lib/media/media-capabilities";
import {
  buildDeterministicFrameSchedule,
  buildEmissionPlanFromSourceTimes,
  measureFramePacingStats,
  selectLatestEligibleScheduledFrame
} from "@/lib/upload/export-frame-pacing";
import {
  isSeekTimeoutDuringPoseSampling,
  shouldNormalize,
  type VideoDiagnostics
} from "@/lib/upload/processing-normalization";

export type ProcessVideoOptions = {
  cadenceFps: number;
  signal?: AbortSignal;
  onProgress?: (progress: number, stageLabel: string) => void;
  normalizationStrategy?: "auto" | "force" | "off";
};

type SourceKind = "original" | "normalized";

export type ProcessVideoResult = {
  timeline: PoseTimeline;
  analysisFile: File;
  analysisSourceKind: SourceKind;
};

const SEEK_EPSILON_SECONDS = 0.001;
const SEEK_TIMEOUT_MS = 8000;
const INITIAL_READY_TIMEOUT_MS = 8000;
const MIN_TIMESTAMP_STEP_MS = 1;
const EXPORT_FINALIZE_TIMEOUT_MS = 15000;
const EXPORT_FRAME_OVERRUN_TOLERANCE = 2;
const EXPORT_DURATION_DRIFT_WARNING_PCT = 10;
const EXPORT_DURATION_DIAGNOSTIC_TOLERANCE_RATIO = 0.02;
const EXPORT_ENCODED_DURATION_TOLERANCE_MS = 350;
const UPLOAD_DIAGNOSTICS_PREFIX = "[upload-processing]";

type VideoFrameMetadata = {
  mediaTime?: number;
};

type RequestVideoFrameCallback = (callback: (_now: number, metadata: VideoFrameMetadata) => void) => number;

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
      rotationMetadata: undefined,
      colorTransfer: inferredHdr ? "HLG/HDR (inferred)" : undefined,
      isHdrSource: inferredHdr,
      hasSuspiciousMetadata
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function samplePoseTimelineFromAnalysisSource(
  analysisFile: File,
  analysisSourceKind: SourceKind,
  options: ProcessVideoOptions,
  originalFileType: string
): Promise<ProcessVideoResult> {
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
        frames.push(
          mapLandmarksToPoseFrame(firstPose, timestampMs, {
            frameWidth: video.videoWidth,
            frameHeight: video.videoHeight,
            mirrored: false
          })
        );
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
          mimeType: analysisFile.type || originalFileType
        },
        frames,
        generatedAtIso: new Date().toISOString()
      },
      analysisFile,
      analysisSourceKind
    };
  } finally {
    poseLandmarker.close?.();
    URL.revokeObjectURL(objectUrl);
  }
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
  const selected = selectPreferredCaptureMimeType();
  logUploadEvent("NORMALIZATION_CAPTURE_MIME_SELECTED", { mimeType: selected });
  return selected;
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

async function readBlobVideoDurationMs(blob: Blob): Promise<number | null> {
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  const objectUrl = URL.createObjectURL(blob);
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Unable to read annotated output metadata."));
    });
    if (!Number.isFinite(video.duration)) {
      return null;
    }
    return Math.max(0, Math.round(video.duration * 1000));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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
    rotationMetadata: diagnostics.rotationMetadata ?? "unknown",
    durationMs: diagnostics.durationMs,
    fps: diagnostics.fps,
    codec: diagnostics.codec,
    colorTransfer: diagnostics.colorTransfer
  });

  const normalizationDecision = shouldNormalize(file, diagnostics);
  logUploadEvent("NORMALIZATION_DECISION", {
    fileName: file.name,
    required: normalizationDecision.required,
    reasons: normalizationDecision.reasons
  });

  let analysisFile = file;
  let analysisSourceKind: SourceKind = "original";

  const normalizationStrategy = options.normalizationStrategy ?? "auto";
  const shouldRunNormalization = normalizationStrategy === "force" || (normalizationStrategy === "auto" && normalizationDecision.required);

  if (shouldRunNormalization) {
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
  } else if (normalizationDecision.required && normalizationStrategy === "off") {
    logUploadEvent("NORMALIZATION_BYPASSED_BY_USER", {
      fileName: file.name,
      reasons: normalizationDecision.reasons
    });
  }

  let retryWithNormalizedSource = false;
  try {
    logUploadEvent("ANALYSIS_SOURCE_SELECTED", {
      mode: analysisSourceKind,
      selectedFileName: analysisFile.name,
      selectedMimeType: analysisFile.type || "unknown"
    });
    try {
      return await samplePoseTimelineFromAnalysisSource(analysisFile, analysisSourceKind, options, file.type);
    } catch (error) {
      const shouldRetryWithNormalizedSource =
        analysisSourceKind === "original" && !retryWithNormalizedSource && isSeekTimeoutDuringPoseSampling(error);
      if (!shouldRetryWithNormalizedSource) {
        throw error;
      }

      retryWithNormalizedSource = true;
      logUploadEvent("ANALYSIS_RETRY_NORMALIZED_AFTER_SEEK_TIMEOUT", {
        fileName: file.name,
        reason: error instanceof Error ? error.message : "unknown"
      });

      const normalizedFile = await normalizeVideoForAnalysis(file, diagnostics, options.signal);
      analysisFile = normalizedFile;
      analysisSourceKind = "normalized";
      logUploadEvent("ANALYSIS_SOURCE_SELECTED", {
        mode: analysisSourceKind,
        selectedFileName: analysisFile.name,
        selectedMimeType: analysisFile.type || "unknown",
        trigger: "seek-timeout-retry"
      });
      return await samplePoseTimelineFromAnalysisSource(analysisFile, analysisSourceKind, options, file.type);
    }
  } catch (error) {
    throw toUserFacingUploadError(error);
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
    phaseLabels?: Record<string, string>;
    phaseCount?: number;
    onProgress?: (progress: number, stageLabel: string) => void;
    analysisSourceKind?: "original" | "normalized";
    exportSourceFileName?: string;
  }
): Promise<{
  blob: Blob;
  mimeType: string;
  diagnostics: {
    sourceDurationSec: number;
    analyzedDurationSec: number;
    renderedFrameCount: number;
    renderFpsTarget: number;
    firstFrameTsMs: number | null;
    lastFrameTsMs: number | null;
    expectedOutputDurationSec: number;
    actualOutputDurationSec: number | null;
    durationDriftSec: number | null;
    durationDriftPct: number | null;
    exportContainerType: string;
    durationDriftWarning: boolean;
    durationDriftWarningMessage?: string;
  };
}> {
  const { video, objectUrl } = await loadVideoElement(file);
  const geometry = createAnnotatedExportGeometry({
    sourceWidth: video.videoWidth,
    sourceHeight: video.videoHeight,
    timelineWidth: timeline.video.width,
    timelineHeight: timeline.video.height
  });
  const canvas = document.createElement("canvas");
  canvas.width = geometry.canvasWidth;
  canvas.height = geometry.canvasHeight;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("2D canvas context unavailable for annotated export.");
  }

  const mediaDurationMs = Number.isFinite(video.duration) ? Math.max(0, Math.round(video.duration * 1000)) : undefined;
  let exportPlan: ReturnType<typeof resolveExportTimeline>;
  try {
    exportPlan = resolveExportTimeline(timeline, { mediaDurationMs });
  } catch (error) {
    logUploadEvent("ANNOTATED_EXPORT_REJECTED", {
      reason: error instanceof Error ? error.message : String(error),
      timelineDurationMs: timeline.video.durationMs,
      mediaDurationMs,
      timelineCadenceFps: timeline.cadenceFps
    });
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
  const durationMs = exportPlan.durationMs;
  const exportFps = exportPlan.fps;
  const frameDurationMs = exportPlan.frameDurationMs;
  const expectedFrameScheduleMs = buildDeterministicFrameSchedule(durationMs, exportFps);
  const expectedFrameCount = expectedFrameScheduleMs.length;
  const stream = canvas.captureStream(exportFps);
  const mimeType = selectPreferredCaptureMimeType();
  logUploadEvent("ANNOTATED_EXPORT_CAPTURE_MIME_SELECTED", { mimeType });
  const recorder = new MediaRecorder(stream, { mimeType });
  const [videoTrack] = stream.getVideoTracks();
  const requestFrame = videoTrack && "requestFrame" in videoTrack ? () => (videoTrack as CanvasCaptureMediaStreamTrack).requestFrame() : null;
  const chunks: BlobPart[] = [];
  let actualRenderedFrameCount = 0;
  const renderedTimestampsMs: number[] = [];
  const sampledSourceFrameIndices: number[] = [];
  let decodedSourceFrameCount = 0;
  let sourceFrameDeltaCount = 0;
  let sourceFrameDeltaSumMs = 0;
  let scheduledFrameDrops = 0;
  let previousSourceMediaTimeMs: number | null = null;
  let inferredSourceFps: number | null = null;
  let firstDecodedTimestampMs: number | null = null;
  let lastDecodedTimestampMs: number | null = null;
  const phaseLabels = options?.phaseLabels;
  const phaseCount = options?.phaseCount;
  const sourceFrames = timeline.frames;
  const sourceDurationSec = durationMs / 1000;
  const analyzedDurationSec = timeline.video.durationMs / 1000;
  const expectedOutputDurationSec = durationMs / 1000;
  const maxRenderRuntimeMs = Math.round(durationMs * (1 + EXPORT_DURATION_DIAGNOSTIC_TOLERANCE_RATIO));
  const exportProjection = geometry.projection;
  const centerOfGravityTracker = createCenterOfGravityTracker();

  if (process.env.NODE_ENV !== "production") {
    console.debug("[upload-processing] ANNOTATED_EXPORT_GEOMETRY", {
      analysisSourceKind: options?.analysisSourceKind ?? "unknown",
      exportSourceFileName: options?.exportSourceFileName ?? file.name,
      exportSourceWidth: video.videoWidth,
      exportSourceHeight: video.videoHeight,
      timelineWidth: timeline.video.width,
      timelineHeight: timeline.video.height,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      projectionSourceWidth: geometry.canvasWidth,
      projectionSourceHeight: geometry.canvasHeight,
      projectionRenderedWidth: exportProjection.renderedWidth,
      projectionRenderedHeight: exportProjection.renderedHeight,
      projectionOffsetX: exportProjection.offsetX,
      projectionOffsetY: exportProjection.offsetY,
      timelineMatchesSource: geometry.timelineMatchesSource
    });
  }
  if (!geometry.timelineMatchesSource) {
    logUploadEvent("ANNOTATED_EXPORT_TIMELINE_DIMENSION_MISMATCH", {
      analysisSourceKind: options?.analysisSourceKind ?? "unknown",
      exportSourceFileName: options?.exportSourceFileName ?? file.name,
      exportSourceWidth: video.videoWidth,
      exportSourceHeight: video.videoHeight,
      timelineWidth: timeline.video.width,
      timelineHeight: timeline.video.height
    });
  }

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const completed = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("Annotated export failed: recorder error."));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  const overlaySamples =
    options?.includeAnalysisOverlay !== false && options?.analysisSession
      ? buildReplayOverlaySamples(options.analysisSession, [
          0,
          timeline.video.durationMs,
          ...timeline.frames.map((frame) => frame.timestampMs),
          ...options.analysisSession.events.map((event) => event.timestampMs)
        ])
      : [];

  try {
    options?.onProgress?.(0.02, "Preparing export timeline");
    recorder.start();
    logUploadEvent("ANNOTATED_EXPORT_START", {
      sourceDurationMs: durationMs,
      durationSource: exportPlan.durationSource,
      targetExportFps: exportFps,
      fpsSource: exportPlan.fpsSource,
      expectedFrameCount,
      hasRequestFrame: Boolean(requestFrame)
    });
    logUploadEvent("ANNOTATED_EXPORT_TIMING_SCOPE", {
      guarantee: "partial",
      reason: "MediaRecorder controls encoded timestamps"
    });

    const renderFrameAtTimestamp = (timestampMs: number, sourceMediaTimeMs?: number) => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const frame = getNearestPoseFrame(sourceFrames, timestampMs);
      drawPoseOverlay(ctx, canvas.width, canvas.height, frame, {
        projection: exportProjection,
        centerOfGravityTracker
      });
      if (options?.includeAnalysisOverlay !== false && options?.analysisSession) {
        const overlayState = getOverlaySampleAtTime(overlaySamples, timestampMs);
        drawAnalysisOverlay(ctx, canvas.width, canvas.height, overlayState, {
          modeLabel: options.overlayModeLabel,
          showDrillMetrics: options.includeDrillMetrics,
          phaseLabels,
          phaseCount
        });
      } else if (options?.includeAnalysisOverlay !== false && options?.overlayModeLabel) {
        drawAnalysisOverlay(ctx, canvas.width, canvas.height, null, {
          modeLabel: options.overlayModeLabel,
          showDrillMetrics: false
        });
      }

      requestFrame?.();
      actualRenderedFrameCount += 1;
      renderedTimestampsMs.push(timestampMs);
      if (typeof sourceMediaTimeMs === "number" && Number.isFinite(sourceMediaTimeMs)) {
        sampledSourceFrameIndices.push(Math.max(0, Math.round(sourceMediaTimeMs)));
      }
    };

    try {
      const hasVideoFrameCallback = typeof video.requestVideoFrameCallback === "function";
      let scheduleIndex = 0;
      video.currentTime = 0;

      if (!hasVideoFrameCallback) {
        logUploadEvent("ANNOTATED_EXPORT_SOURCE_CALLBACK_UNAVAILABLE");
      }

      await video.play();

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const renderStartedAtMs = performance.now();
        let runtimeOverrunLogged = false;

        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve();
        };

        const fail = (error: Error) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          reject(error);
        };

        const processSourceMediaTime = (sourceMediaTimeMs: number) => {
          const elapsedMs = Math.round(performance.now() - renderStartedAtMs);
          if (!runtimeOverrunLogged && elapsedMs > maxRenderRuntimeMs) {
            runtimeOverrunLogged = true;
            logUploadEvent("ANNOTATED_EXPORT_RENDER_RUNTIME_OVERRUN_DIAGNOSTIC", {
              elapsedMs,
              maxRenderRuntimeMs,
              sourceDurationMs: durationMs,
              note: "Diagnostic only; export completion remains source-timestamp-driven."
            });
          }
          const clampedSourceMediaTimeMs = Math.max(0, Math.min(durationMs, sourceMediaTimeMs));
          decodedSourceFrameCount += 1;
          if (firstDecodedTimestampMs === null) {
            firstDecodedTimestampMs = clampedSourceMediaTimeMs;
          }
          lastDecodedTimestampMs = clampedSourceMediaTimeMs;

          if (previousSourceMediaTimeMs !== null && clampedSourceMediaTimeMs > previousSourceMediaTimeMs) {
            sourceFrameDeltaCount += 1;
            sourceFrameDeltaSumMs += clampedSourceMediaTimeMs - previousSourceMediaTimeMs;
          }
          previousSourceMediaTimeMs = clampedSourceMediaTimeMs;

          const selection = selectLatestEligibleScheduledFrame(expectedFrameScheduleMs, scheduleIndex, clampedSourceMediaTimeMs);
          const latestEligibleIndex = selection.renderScheduleIndex;
          scheduleIndex = selection.nextScheduleIndex;
          scheduledFrameDrops += selection.skippedScheduledFrames;

          if (latestEligibleIndex !== null) {
            renderFrameAtTimestamp(expectedFrameScheduleMs[latestEligibleIndex], clampedSourceMediaTimeMs);
            if (
              latestEligibleIndex % Math.max(1, Math.floor(expectedFrameCount / 12)) === 0 ||
              latestEligibleIndex === expectedFrameCount - 1
            ) {
              logUploadEvent("ANNOTATED_EXPORT_FRAME_PROGRESS", {
                frameIndex: latestEligibleIndex + 1,
                expectedFrameCount,
                timestampMs: expectedFrameScheduleMs[latestEligibleIndex]
              });
            }
            options?.onProgress?.(
              0.05 + ((latestEligibleIndex + 1) / expectedFrameCount) * 0.87,
              `Rendering frames ${latestEligibleIndex + 1}/${expectedFrameCount}`
            );
          }

          if (scheduleIndex >= expectedFrameScheduleMs.length) {
            finish();
          }
        };

        const onEnded = () => {
          processSourceMediaTime(durationMs);
          finish();
        };

        const onError = () => fail(new Error("Annotated export failed while decoding source frames."));

        const cleanup = () => {
          video.removeEventListener("ended", onEnded);
          video.removeEventListener("error", onError);
        };

        video.addEventListener("ended", onEnded, { once: true });
        video.addEventListener("error", onError, { once: true });

        if (hasVideoFrameCallback) {
          const requestSourceFrame = video.requestVideoFrameCallback.bind(video) as RequestVideoFrameCallback;
          const processSourceFrame = (_now: number, metadata: VideoFrameMetadata) => {
            processSourceMediaTime(Math.round((metadata.mediaTime ?? video.currentTime) * 1000));
            if (!settled && !video.ended) {
              requestSourceFrame(processSourceFrame);
            }
          };
          requestSourceFrame(processSourceFrame);
          return;
        }

        const rafLoop = () => {
          processSourceMediaTime(Math.round(video.currentTime * 1000));
          if (!settled && !video.ended) {
            requestAnimationFrame(rafLoop);
          }
        };
        requestAnimationFrame(rafLoop);
      });
      video.pause();
    } catch (error) {
      logUploadEvent("ANNOTATED_EXPORT_RENDER_FAILED", { message: error instanceof Error ? error.message : String(error) });
      throw error;
    }

    options?.onProgress?.(0.94, "Finalizing recorder output…");
    recorder.stop();

    const blob = await Promise.race([
      completed,
      new Promise<Blob>((_, reject) => {
        setTimeout(() => reject(new Error("Annotated export timed out while finalizing recorder output.")), EXPORT_FINALIZE_TIMEOUT_MS);
      })
    ]);
    const muxedDurationMs = await readBlobVideoDurationMs(blob);
    logUploadEvent("ANNOTATED_EXPORT_COMPLETE", { sizeBytes: blob.size, mimeType, muxedDurationMs: muxedDurationMs ?? "unknown" });

    if (blob.size === 0) {
      throw new Error("Annotated export failed: recorder produced an empty file.");
    }

    inferredSourceFps =
      sourceFrameDeltaCount > 0 && sourceFrameDeltaSumMs > 0 ? Math.round((1000 / (sourceFrameDeltaSumMs / sourceFrameDeltaCount)) * 100) / 100 : null;
    const sourceFpsForStats = typeof inferredSourceFps === "number" && inferredSourceFps > 0 ? inferredSourceFps : null;
    const sourceFrameIndices =
      sourceFpsForStats !== null
        ? renderedTimestampsMs.map((timestampMs) => Math.max(0, Math.round((timestampMs / 1000) * sourceFpsForStats)))
        : [];
    const pacingStats =
      sourceFrameIndices.length > 1
        ? measureFramePacingStats(renderedTimestampsMs, sourceFrameIndices)
        : { duplicatedFrames: "unknown", skippedSourceFrames: "unknown", averageFrameDeltaMs: measureFramePacingStats(renderedTimestampsMs, sampledSourceFrameIndices).averageFrameDeltaMs };

    const emissionPlan = buildEmissionPlanFromSourceTimes(expectedFrameScheduleMs, renderedTimestampsMs, durationMs);
    const firstEmittedTimestampMs = renderedTimestampsMs[0] ?? null;
    const lastEmittedTimestampMs = renderedTimestampsMs.at(-1) ?? null;

    logUploadEvent("ANNOTATED_EXPORT_SUMMARY", {
      sourceDurationMs: durationMs,
      analyzedDurationMs: timeline.video.durationMs,
      decodedFrameCount: decodedSourceFrameCount,
      sourceVideoFps: inferredSourceFps ?? "unknown",
      targetExportFps: exportFps,
      outputFrameDurationMs: frameDurationMs,
      outputTimebase: `1/${exportFps}`,
      expectedFrameCount,
      actualRenderedFrameCount,
      emittedAnnotatedFrameCount: renderedTimestampsMs.length,
      monotonicEmittedTimestampCount: emissionPlan.renderedTimestampsMs.length,
      firstDecodedTimestampMs,
      lastDecodedTimestampMs,
      firstEmittedTimestampMs,
      lastEmittedTimestampMs,
      encodedFrameCountEstimate: actualRenderedFrameCount,
      finalAnnotatedMuxedDurationMs: muxedDurationMs ?? "unknown",
      exportDurationMs: durationMs,
      averageFrameDeltaMs: Math.round(Number(pacingStats.averageFrameDeltaMs) * 100) / 100,
      duplicatedFrames: pacingStats.duplicatedFrames,
      skippedFrames: pacingStats.skippedSourceFrames,
      scheduledFrameDrops,
      timingDeterminism: "partial (MediaRecorder timestamps remain browser-controlled)",
      actualRecorderMimeType: recorder.mimeType || mimeType
    });
    if (actualRenderedFrameCount > expectedFrameCount + EXPORT_FRAME_OVERRUN_TOLERANCE) {
      logUploadEvent("ANNOTATED_EXPORT_FRAME_OVERRUN_WARNING", {
        expectedFrameCount,
        actualRenderedFrameCount,
        toleranceFrames: EXPORT_FRAME_OVERRUN_TOLERANCE
      });
    }

    const actualOutputDurationSec = muxedDurationMs === null ? null : muxedDurationMs / 1000;
    const durationDriftSec = actualOutputDurationSec === null ? null : actualOutputDurationSec - expectedOutputDurationSec;
    const durationDriftPct = durationDriftSec === null || expectedOutputDurationSec <= 0
      ? null
      : (durationDriftSec / expectedOutputDurationSec) * 100;
    const durationDriftWarning = typeof durationDriftPct === "number" && Math.abs(durationDriftPct) > EXPORT_DURATION_DRIFT_WARNING_PCT;
    const durationDriftWarningMessage = durationDriftWarning
      ? `Annotated export duration drift exceeded threshold (${durationDriftPct.toFixed(2)}%, abs>${EXPORT_DURATION_DRIFT_WARNING_PCT}%).`
      : undefined;

    if (durationDriftWarning) {
      logUploadEvent("ANNOTATED_EXPORT_DURATION_DRIFT_WARNING", {
        sourceDurationSec,
        expectedOutputDurationSec,
        actualOutputDurationSec,
        durationDriftSec,
        durationDriftPct,
        driftThresholdPct: EXPORT_DURATION_DRIFT_WARNING_PCT
      });
    }
    if (muxedDurationMs !== null && muxedDurationMs > durationMs + EXPORT_ENCODED_DURATION_TOLERANCE_MS) {
      logUploadEvent("ANNOTATED_EXPORT_DURATION_HARD_GUARD", {
        sourceDurationMs: durationMs,
        encodedDurationMs: muxedDurationMs,
        toleranceMs: EXPORT_ENCODED_DURATION_TOLERANCE_MS
      });
      throw new Error(
        `Annotated export duration exceeded source bounds (encoded=${muxedDurationMs}ms, source=${durationMs}ms, tolerance=${EXPORT_ENCODED_DURATION_TOLERANCE_MS}ms).`
      );
    }

    options?.onProgress?.(1, "Annotated export complete");
    return {
      blob,
      mimeType,
      diagnostics: {
        sourceDurationSec,
        analyzedDurationSec,
        renderedFrameCount: actualRenderedFrameCount,
        renderFpsTarget: exportFps,
        firstFrameTsMs: renderedTimestampsMs[0] ?? null,
        lastFrameTsMs: renderedTimestampsMs.at(-1) ?? null,
        expectedOutputDurationSec,
        actualOutputDurationSec,
        durationDriftSec,
        durationDriftPct,
        exportContainerType: (recorder.mimeType || mimeType || "unknown").split(";")[0] ?? "unknown",
        durationDriftWarning,
        ...(durationDriftWarningMessage ? { durationDriftWarningMessage } : {})
      }
    };
  } finally {
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    videoTrack?.stop();
    URL.revokeObjectURL(objectUrl);
  }
}

export function buildAnalysisSummary(
  timeline: PoseTimeline,
  exportDiagnostics?: {
    sourceDurationSec: number;
    analyzedDurationSec: number;
    renderedFrameCount: number;
    renderFpsTarget: number;
    firstFrameTsMs: number | null;
    lastFrameTsMs: number | null;
    expectedOutputDurationSec: number;
    actualOutputDurationSec: number | null;
    durationDriftSec: number | null;
    durationDriftPct: number | null;
    exportContainerType: string;
    durationDriftWarning: boolean;
    durationDriftWarningMessage?: string;
  }
) {
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
    durationMs: timeline.video.durationMs,
    ...(exportDiagnostics ? { exportDiagnostics } : {})
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
