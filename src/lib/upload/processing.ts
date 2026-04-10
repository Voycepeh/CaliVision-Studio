import { createPoseLandmarkerForJob, mapLandmarksToPoseFrame } from "@/lib/upload/pose-landmarker";
import { buildReplayOverlaySamples, getOverlaySampleAtTime } from "@/lib/analysis/replay-state";
import type { AnalysisSessionRecord } from "@/lib/analysis/session-repository";
import { drawAnalysisOverlay, drawPoseOverlay, getNearestPoseFrame } from "@/lib/upload/overlay";
import type { PoseTimeline } from "@/lib/upload/types";
import { createOverlayProjection } from "@/lib/live/overlay-geometry";
import { resolveExportTimeline } from "@/lib/upload/export-timeline";
import { buildDeterministicFrameSchedule, measureFramePacingStats } from "@/lib/upload/export-frame-pacing";

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
  rotationMetadata?: number;
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
const EXPORT_FINALIZE_TIMEOUT_MS = 15000;
const EXPORT_FRAME_OVERRUN_TOLERANCE = 2;
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

function shouldNormalize(file: File, diagnostics: VideoDiagnostics): { required: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const width = diagnostics.width ?? 0;
  const height = diagnostics.height ?? 0;
  const isPortrait = width > 0 && height > 0 && height > width;
  if (isPortrait && typeof diagnostics.rotationMetadata === "number" && diagnostics.rotationMetadata % 360 !== 0) {
    reasons.push("portrait source has non-zero rotation metadata");
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
    rotationMetadata: diagnostics.rotationMetadata ?? "unknown",
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
    phaseLabels?: Record<string, string>;
    phaseCount?: number;
    onProgress?: (progress: number, stageLabel: string) => void;
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
  const expectedFrameScheduleMs = buildDeterministicFrameSchedule(durationMs, exportFps);
  const expectedFrameCount = expectedFrameScheduleMs.length;
  const stream = canvas.captureStream(0);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType });
  const [videoTrack] = stream.getVideoTracks();
  const requestFrame = videoTrack && "requestFrame" in videoTrack ? () => (videoTrack as CanvasCaptureMediaStreamTrack).requestFrame() : null;
  const chunks: BlobPart[] = [];
  let actualRenderedFrameCount = 0;
  const renderedTimestampsMs: number[] = [];
  const sampledSourceFrameIndices: number[] = [];
  let sourceFrameDeltaCount = 0;
  let sourceFrameDeltaSumMs = 0;
  let previousSourceMediaTimeMs: number | null = null;
  let inferredSourceFps: number | null = null;
  const phaseLabels = options?.phaseLabels;
  const phaseCount = options?.phaseCount;
  const sourceFrames = timeline.frames;
  const exportProjection = createOverlayProjection({
    viewportWidth: canvas.width,
    viewportHeight: canvas.height,
    sourceWidth: video.videoWidth,
    sourceHeight: video.videoHeight,
    fitMode: "contain",
    mirrored: false
  });

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

    const renderFrameAtTimestamp = (timestampMs: number, sourceMediaTimeMs?: number) => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const frame = getNearestPoseFrame(sourceFrames, timestampMs);
      drawPoseOverlay(ctx, canvas.width, canvas.height, frame, { projection: exportProjection });
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
      const sourceTimestampMs = sourceMediaTimeMs ?? timestampMs;
      sampledSourceFrameIndices.push(Math.max(0, Math.round((sourceTimestampMs / 1000) * exportFps)));
    };

    try {
      const hasVideoFrameCallback = typeof video.requestVideoFrameCallback === "function";
      let usedSourceFrameCallback = false;
      if (hasVideoFrameCallback) {
        let scheduleIndex = 0;
        video.currentTime = 0;
        try {
          await video.play();
          usedSourceFrameCallback = true;
          const requestSourceFrame = video.requestVideoFrameCallback.bind(video) as RequestVideoFrameCallback;

          await new Promise<void>((resolve) => {
            const onComplete = () => {
              while (scheduleIndex < expectedFrameScheduleMs.length) {
                renderFrameAtTimestamp(expectedFrameScheduleMs[scheduleIndex], previousSourceMediaTimeMs ?? durationMs);
                scheduleIndex += 1;
              }
              resolve();
            };

            const processSourceFrame = (_now: number, metadata: VideoFrameMetadata) => {
              const sourceMediaTimeMs = Math.max(0, Math.round((metadata.mediaTime ?? video.currentTime) * 1000));
              if (previousSourceMediaTimeMs !== null && sourceMediaTimeMs > previousSourceMediaTimeMs) {
                sourceFrameDeltaCount += 1;
                sourceFrameDeltaSumMs += sourceMediaTimeMs - previousSourceMediaTimeMs;
              }
              previousSourceMediaTimeMs = sourceMediaTimeMs;

              while (scheduleIndex < expectedFrameScheduleMs.length && expectedFrameScheduleMs[scheduleIndex] <= sourceMediaTimeMs) {
                renderFrameAtTimestamp(expectedFrameScheduleMs[scheduleIndex], sourceMediaTimeMs);
                if (
                  scheduleIndex % Math.max(1, Math.floor(expectedFrameCount / 12)) === 0 ||
                  scheduleIndex === expectedFrameCount - 1
                ) {
                  logUploadEvent("ANNOTATED_EXPORT_FRAME_PROGRESS", {
                    frameIndex: scheduleIndex + 1,
                    expectedFrameCount,
                    timestampMs: expectedFrameScheduleMs[scheduleIndex]
                  });
                }
                options?.onProgress?.(
                  0.05 + ((scheduleIndex + 1) / expectedFrameCount) * 0.87,
                  `Rendering frames ${scheduleIndex + 1}/${expectedFrameCount}`
                );
                scheduleIndex += 1;
              }

              if (scheduleIndex >= expectedFrameScheduleMs.length || video.ended) {
                onComplete();
                return;
              }
              requestSourceFrame(processSourceFrame);
            };

            video.addEventListener("ended", onComplete, { once: true });
            requestSourceFrame(processSourceFrame);
          });
        } catch (error) {
          logUploadEvent("ANNOTATED_EXPORT_SOURCE_CALLBACK_FALLBACK", {
            reason: error instanceof Error ? error.message : String(error)
          });
        } finally {
          video.pause();
        }
      } else {
        logUploadEvent("ANNOTATED_EXPORT_SOURCE_CALLBACK_UNAVAILABLE");
      }

      if (!usedSourceFrameCallback) {
        for (let frameIndex = 0; frameIndex < expectedFrameCount; frameIndex += 1) {
          const timestampMs = expectedFrameScheduleMs[frameIndex];
          await seekVideo(video, timestampMs / 1000);
          renderFrameAtTimestamp(timestampMs);

          if (frameIndex % Math.max(1, Math.floor(expectedFrameCount / 12)) === 0 || frameIndex === expectedFrameCount - 1) {
            logUploadEvent("ANNOTATED_EXPORT_FRAME_PROGRESS", {
              frameIndex: frameIndex + 1,
              expectedFrameCount,
              timestampMs
            });
          }
          options?.onProgress?.(
            0.05 + ((frameIndex + 1) / expectedFrameCount) * 0.87,
            `Rendering frames ${frameIndex + 1}/${expectedFrameCount}`
          );
        }
      }
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
    logUploadEvent("ANNOTATED_EXPORT_COMPLETE", { sizeBytes: blob.size, mimeType });

    if (blob.size === 0) {
      throw new Error("Annotated export failed: recorder produced an empty file.");
    }

    inferredSourceFps =
      sourceFrameDeltaCount > 0 && sourceFrameDeltaSumMs > 0 ? Math.round((1000 / (sourceFrameDeltaSumMs / sourceFrameDeltaCount)) * 100) / 100 : null;
    const pacingStats = measureFramePacingStats(renderedTimestampsMs, sampledSourceFrameIndices);

    logUploadEvent("ANNOTATED_EXPORT_SUMMARY", {
      sourceDurationMs: durationMs,
      sourceVideoFps: inferredSourceFps ?? "unknown",
      targetExportFps: exportFps,
      expectedFrameCount,
      actualRenderedFrameCount,
      encodedFrameCountEstimate: actualRenderedFrameCount,
      exportDurationMs: durationMs,
      averageFrameDeltaMs: Math.round(pacingStats.averageFrameDeltaMs * 100) / 100,
      duplicatedFrames: pacingStats.duplicatedFrames,
      skippedFrames: pacingStats.skippedSourceFrames,
      actualRecorderMimeType: recorder.mimeType || mimeType
    });
    if (actualRenderedFrameCount > expectedFrameCount + EXPORT_FRAME_OVERRUN_TOLERANCE) {
      logUploadEvent("ANNOTATED_EXPORT_FRAME_OVERRUN_WARNING", {
        expectedFrameCount,
        actualRenderedFrameCount,
        toleranceFrames: EXPORT_FRAME_OVERRUN_TOLERANCE
      });
    }

    options?.onProgress?.(1, "Annotated export complete");
    return { blob, mimeType };
  } finally {
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    videoTrack?.stop();
    URL.revokeObjectURL(objectUrl);
  }
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
