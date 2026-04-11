"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { deriveReplayOverlayStateAtTime } from "@/lib/analysis/replay-state";
import { resolvePhaseLabel } from "@/lib/analysis/event-labels";
import { drawAnalysisOverlay, drawPoseOverlay, getNearestPoseFrame } from "@/lib/workflow/pose-overlay";
import { buildAnalysisSummary, exportAnnotatedVideo, processVideoFile, readVideoMetadata } from "@/lib/upload/processing";
import { fitVideoContainRect } from "@/lib/upload/video-layout";
import { createOverlayProjection } from "@/lib/live/overlay-geometry";
import type { UploadJob } from "@/lib/upload/types";
import { clearFileInputValue, DEFAULT_TRACE_STEP_MS, nextUploadWorkflowResetKey } from "@/lib/upload/workflow-reset";
import { createUploadJobDrillSelection } from "@/lib/upload/drill-selection";
import { buildCompletedUploadAnalysisSession, buildPhaseRuntimeModel, formatCameraViewLabel, type AnalysisSessionRecord } from "@/lib/analysis";
import { formatDurationShort } from "@/lib/format/duration";
import { formatDurationClock, toFiniteNonNegativeMs } from "@/lib/format/safe-duration";
import { DRILL_SOURCE_ORDER, formatDrillSourceLabel, type DrillSourceKind } from "@/lib/drill-source";
import { canToggleCompletedPreview, resolveAvailableDownloads, resolveUnifiedResultPreviewState, type PreviewSurface } from "@/lib/results/preview-state";
import { extensionFromMimeType, resolveSafeDelivery, selectPreferredDeliverySource, selectPreviewSource } from "@/lib/media/media-capabilities";
import { resolveUploadDownloadLabel } from "@/lib/media/download-labels";
import type { PortableDrill } from "@/lib/schema/contracts";
import { DrillSetupHeader } from "@/components/workflow-setup/DrillSetupHeader";
import { DrillSetupShell } from "@/components/workflow-setup/DrillSetupShell";
import { ReferenceAnimationPanel } from "@/components/workflow-setup/ReferenceAnimationPanel";
import { readActiveDrillContext, setActiveDrillContext } from "@/lib/workflow/drill-context";
import { useAvailableDrills } from "@/lib/workflow/use-available-drills";

const DEFAULT_CADENCE_FPS = 12;
const SELECTED_DRILL_STORAGE_KEY = "upload.selected-drill";
const TRACE_STEP_OPTIONS = [100, 500, 1000] as const;
const FREESTYLE_DRILL_KEY = "freestyle";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(durationMs?: number): string {
  if (toFiniteNonNegativeMs(durationMs) === null) {
    return "Duration unavailable";
  }
  return durationMs !== undefined && durationMs < 10000 ? formatDurationShort(durationMs) : formatDurationClock(durationMs);
}

function formatConfidence(value?: number): string {
  if (typeof value !== "number") {
    return "n/a";
  }
  return `${Math.round(value * 100)}%`;
}

function formatTraceStepLabel(stepMs: number): string {
  return `${(stepMs / 1000).toFixed(1)}s`;
}

function buildPhaseLabelMap(drill?: PortableDrill | null): Record<string, string> {
  if (!drill) {
    return {};
  }
  if (drill.analysis) {
    return buildPhaseRuntimeModel(drill, drill.analysis).phaseLabelById;
  }
  return drill.phases.reduce<Record<string, string>>((acc, phase, index) => {
    const label = (phase.name || phase.title || "").trim() || phase.phaseId;
    acc[phase.phaseId] = `${index + 1}. ${label}`;
    return acc;
  }, {});
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function createArtifactBaseName(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, "");
}

function createUploadSourceUri(jobId: string, fileName: string): string {
  return `upload://local/${jobId}/${encodeURIComponent(fileName)}`;
}

function summarizeTrace(
  session: AnalysisSessionRecord,
  stepMs: number,
  phaseLabels: Record<string, string>
): Array<{ timestampMs: number; phase: string; confidence: number; repCount: number }> {
  const frames = [...session.frameSamples].sort((a, b) => a.timestampMs - b.timestampMs);
  if (frames.length === 0) {
    return [];
  }

  const rows: Array<{ timestampMs: number; phase: string; confidence: number; repCount: number }> = [];
  const totalDuration = session.summary.analyzedDurationMs ?? frames[frames.length - 1]?.timestampMs ?? 0;

  for (let cursor = 0; cursor <= totalDuration; cursor += stepMs) {
    const nearest = frames.reduce((best, current) => {
      if (!best) return current;
      return Math.abs(current.timestampMs - cursor) < Math.abs(best.timestampMs - cursor) ? current : best;
    }, frames[0]);

    const repCount = session.events.filter((event) => event.type === "rep_complete" && event.timestampMs <= cursor).length;
    rows.push({
      timestampMs: cursor,
      phase: resolvePhaseLabel(nearest?.classifiedPhaseId, phaseLabels),
      confidence: nearest?.confidence ?? 0,
      repCount
    });
  }

  return rows;
}

function isMeaningfullyVariant(traceRows: Array<{ phase: string; repCount: number }>): boolean {
  const uniquePhases = new Set(traceRows.map((row) => row.phase));
  const uniqueRepCounts = new Set(traceRows.map((row) => row.repCount));
  return uniquePhases.size > 1 || uniqueRepCounts.size > 1;
}

function formatTransitionReason(reason: string | undefined): string {
  switch (reason) {
    case "transition_not_ordered_or_allowed_skip":
      return "off authored path";
    case "below_minimum_rep_duration":
      return "rep duration too short";
    case "cooldown_active":
      return "cooldown active";
    case "insufficient_confirmed_transitions":
      return "confidence unstable";
    case "off_path_transition":
      return "off authored path";
    case "unknown_runtime_phase":
      return "phase is outside authored loop";
    case "insufficient_phase_count_for_rep":
      return "at least 2 phases are required for rep counting";
    case "loop_not_completed":
      return "full authored loop was not completed";
    default:
      return reason ?? "unknown";
  }
}

function formatDiagnosticEvent(event: AnalysisSessionRecord["events"][number], phaseLabels: Record<string, string>): string {
  const from = resolvePhaseLabel(event.fromPhaseId, phaseLabels);
  const to = resolvePhaseLabel(event.toPhaseId, phaseLabels);
  const phase = resolvePhaseLabel(event.phaseId, phaseLabels);
  if (event.type === "phase_enter") return `entered phase: ${phase}`;
  if (event.type === "phase_exit") return `exited phase: ${phase}`;
  if (event.type === "invalid_transition") {
    const reason = formatTransitionReason(typeof event.details?.reason === "string" ? event.details.reason : undefined);
    return `transition rejected: ${from} -> ${to} (${reason})`;
  }
  if (event.type === "rep_complete") return `rep completed: ${event.repIndex ?? "?"}`;
  if (event.type === "partial_attempt") {
    const reason = formatTransitionReason(typeof event.details?.reason === "string" ? event.details.reason : undefined);
    return `partial attempt: ${reason}`;
  }
  if (event.type === "hold_start") return `hold started: ${phase}`;
  if (event.type === "hold_end") return `hold ended: ${phase}`;
  return event.type;
}

export function UploadVideoWorkspace() {
  const searchParams = useSearchParams();
  const { session, isConfigured, persistenceMode } = useAuth();
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [analysisSessionsByJobId, setAnalysisSessionsByJobId] = useState<Record<string, AnalysisSessionRecord | null>>({});
  const [cadenceFps, setCadenceFps] = useState(DEFAULT_CADENCE_FPS);
  const [traceStepMs, setTraceStepMs] = useState<number>(DEFAULT_TRACE_STEP_MS);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeAbortRef = useRef<AbortController | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const [rawPreviewObjectUrl, setRawPreviewObjectUrl] = useState<string | null>(null);
  const [annotatedPreviewObjectUrl, setAnnotatedPreviewObjectUrl] = useState<string | null>(null);
  const [showRawDuringProcessing, setShowRawDuringProcessing] = useState(false);
  const [completedPreviewSurface, setCompletedPreviewSurface] = useState<PreviewSurface>("annotated");
  const [annotatedFailureDetails, setAnnotatedFailureDetails] = useState<string | null>(null);
  const [isReferencePanelVisible, setIsReferencePanelVisible] = useState(true);
  const [workflowResetKey, setWorkflowResetKey] = useState(0);
  const activeJob = useMemo(
    () => (selectedJobId ? uploadJobs.find((job) => job.id === selectedJobId) ?? null : uploadJobs[0] ?? null),
    [selectedJobId, uploadJobs]
  );
  const activeSession = useMemo(
    () => (activeJob ? analysisSessionsByJobId[activeJob.id] ?? null : null),
    [activeJob, analysisSessionsByJobId]
  );
  const requestedDrillKey = searchParams.get("drillKey");
  const {
    drillOptions,
    drillOptionGroups,
    drillOptionsLoading,
    selectedDrillKey,
    setSelectedDrillKey,
    selectedSource,
    setSelectedSource
  } = useAvailableDrills({
    session,
    isConfigured,
    requestedDrillKey,
    storageKey: SELECTED_DRILL_STORAGE_KEY,
    fallbackKey: FREESTYLE_DRILL_KEY,
    defaultSource: persistenceMode === "cloud" ? "cloud" : "local"
  });

  const selectedDrill = useMemo(
    () => (selectedDrillKey === FREESTYLE_DRILL_KEY ? null : drillOptions.find((option) => option.key === selectedDrillKey) ?? null),
    [drillOptions, selectedDrillKey]
  );

  useEffect(() => {
    if (typeof window === "undefined" || selectedDrillKey === FREESTYLE_DRILL_KEY) {
      return;
    }
    const context = readActiveDrillContext();
    if (!context) {
      return;
    }
    const matching = drillOptions.find((option) => option.key === selectedDrillKey);
    if (!matching) {
      return;
    }
    setActiveDrillContext({ drillId: matching.drill.drillId, sourceKind: matching.sourceKind, sourceId: matching.sourceId ?? context.sourceId });
  }, [drillOptions, selectedDrillKey]);

  useEffect(() => {
    setSelectedSource((current) => (current === "exchange" ? current : persistenceMode === "cloud" ? "cloud" : "local"));
  }, [persistenceMode, setSelectedSource]);

  useEffect(() => {
    if (!activeJob) {
      setRawPreviewObjectUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
      setAnnotatedPreviewObjectUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
      return;
    }

    const rawUrl = URL.createObjectURL(activeJob.file);
    setRawPreviewObjectUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return rawUrl;
    });
    if (activeJob.artefacts?.annotatedVideoBlob) {
      const annotatedUrl = URL.createObjectURL(activeJob.artefacts.annotatedVideoBlob);
      setAnnotatedPreviewObjectUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return annotatedUrl;
      });
    } else {
      setAnnotatedPreviewObjectUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    }

    return () => {
      URL.revokeObjectURL(rawUrl);
    };
  }, [activeJob]);

  useEffect(() => {
    const video = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    const container = fullscreenContainerRef.current;
    if (!video || !canvas || !container || !activeJob?.artefacts || !rawPreviewObjectUrl) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const targetWidth = Math.max(1, Math.round(containerWidth * dpr));
      const targetHeight = Math.max(1, Math.round(containerHeight * dpr));

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      // Keep drawing in CSS pixels; the transform maps to device pixels for crisp overlay rendering.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, containerWidth, containerHeight);

      // Map normalized landmarks into the real rendered video rectangle (object-fit: contain),
      // including pillar/letterbox offsets, so portrait overlays align with displayed video.
      const videoRect = fitVideoContainRect({
        containerWidth,
        containerHeight,
        videoWidth: video.videoWidth || 0,
        videoHeight: video.videoHeight || 0
      });
      const projection = createOverlayProjection({
        viewportWidth: containerWidth,
        viewportHeight: containerHeight,
        sourceWidth: video.videoWidth || 0,
        sourceHeight: video.videoHeight || 0,
        fitMode: "contain",
        mirrored: false
      });

      const currentMs = video.currentTime * 1000;
      const frame = getNearestPoseFrame(activeJob.artefacts?.poseTimeline.frames ?? [], currentMs);
      // Draw in full viewport space; projection maps normalized landmarks into the rendered video rect.
      drawPoseOverlay(ctx, containerWidth, containerHeight, frame, { projection });
      ctx.save();
      ctx.translate(videoRect.offsetX, videoRect.offsetY);
      if ((activeJob.drillSelection.mode ?? "drill") === "drill" && activeSession) {
        drawAnalysisOverlay(ctx, videoRect.renderedWidth, videoRect.renderedHeight, deriveReplayOverlayStateAtTime(activeSession, currentMs), {
          modeLabel: activeJob.drillSelection.drillBinding.drillName,
          showDrillMetrics: true,
          phaseLabels: buildPhaseLabelMap(activeJob.drillSelection.drill),
          phaseCount: activeJob.drillSelection.drill?.analysis
            ? buildPhaseRuntimeModel(activeJob.drillSelection.drill, activeJob.drillSelection.drill.analysis).phaseCount
            : activeJob.drillSelection.drill?.phases.length
        });
      } else {
        drawAnalysisOverlay(ctx, videoRect.renderedWidth, videoRect.renderedHeight, null, {
          modeLabel: "No drill · Freestyle overlay",
          showDrillMetrics: false
        });
      }
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [activeJob, activeSession, rawPreviewObjectUrl]);

  const startQueuedJob = useCallback(async (jobId: string) => {
    const queuedJob = uploadJobs.find((job) => job.id === jobId);
    if (!queuedJob || queuedJob.status !== "queued") {
      return;
    }

    const processingJob: UploadJob = {
      ...queuedJob,
      status: "processing",
      stageLabel: "Initializing MediaPipe Pose Landmarker",
      progress: 0,
      startedAtIso: new Date().toISOString(),
      errorMessage: undefined,
      errorDetails: undefined
    };

    setIsReferencePanelVisible(false);
    setShowRawDuringProcessing(false);
    setCompletedPreviewSurface("annotated");
    setAnnotatedFailureDetails(null);
    setSelectedJobId(jobId);
    setAnalysisSessionsByJobId((current) => ({ ...current, [jobId]: null }));
    setUploadJobs((current) => current.map((job) => (job.id === jobId ? processingJob : job)));

    const controller = new AbortController();
    activeAbortRef.current = controller;

    try {
      const { timeline, analysisFile, analysisSourceKind } = await processVideoFile(processingJob.file, {
        cadenceFps,
        signal: controller.signal,
        onProgress: (progress, stageLabel) => setUploadJobs((current) => current.map((job) => (job.id === jobId ? { ...job, progress, stageLabel } : job)))
      });

      const completedSession = (processingJob.drillSelection.mode ?? "drill") === "drill" && processingJob.drillSelection.drill
        ? buildCompletedUploadAnalysisSession({
            drill: processingJob.drillSelection.drill,
            drillVersion: processingJob.drillSelection.drillVersion,
            drillBinding: {
              drillId: processingJob.drillSelection.drill.drillId,
              drillName: processingJob.drillSelection.drillBinding.drillName,
              drillVersion: processingJob.drillSelection.drillVersion,
              sourceKind: processingJob.drillSelection.drillBinding.sourceKind === "freestyle" ? "unknown" : processingJob.drillSelection.drillBinding.sourceKind,
              sourceId: processingJob.drillSelection.drillBinding.sourceId,
              sourceLabel: processingJob.drillSelection.drillBinding.sourceLabel
            },
            resolvedCameraView: processingJob.drillSelection.cameraView,
            timeline,
            sourceId: processingJob.id,
            sourceLabel: processingJob.fileName,
            sourceUri: createUploadSourceUri(processingJob.id, processingJob.fileName),
            annotatedVideoUri: createUploadSourceUri(processingJob.id, `${createArtifactBaseName(processingJob.fileName)}.annotated-video.webm`)
          })
        : null;

      setUploadJobs((current) => current.map((job) => (
        job.id === jobId
          ? {
              ...job,
              progress: 0.97,
              stageLabel: analysisSourceKind === "normalized" ? "Rendering annotated video (normalized source)" : "Rendering annotated video"
            }
          : job
      )));

      const overlayOptions = {
        includeAnalysisOverlay: true,
        analysisSession: completedSession,
        overlayModeLabel: (processingJob.drillSelection.mode ?? "drill") === "drill"
          ? processingJob.drillSelection.drillBinding.drillName
          : "No drill · Freestyle overlay",
        includeDrillMetrics: (processingJob.drillSelection.mode ?? "drill") === "drill",
        phaseLabels: buildPhaseLabelMap(processingJob.drillSelection.drill),
        phaseCount: processingJob.drillSelection.drill?.analysis
          ? buildPhaseRuntimeModel(processingJob.drillSelection.drill, processingJob.drillSelection.drill.analysis).phaseCount
          : processingJob.drillSelection.drill?.phases.length
      };

      let annotated: Awaited<ReturnType<typeof exportAnnotatedVideo>> | null = null;
      try {
        annotated = await exportAnnotatedVideo(processingJob.file, timeline, overlayOptions);
      } catch (error) {
        if (analysisSourceKind === "normalized") {
          console.info("[upload-processing] ANNOTATED_EXPORT_FALLBACK_NORMALIZED_SOURCE", {
            fileName: processingJob.fileName,
            reason: error instanceof Error ? error.message : "unknown"
          });
          try {
            annotated = await exportAnnotatedVideo(analysisFile, timeline, overlayOptions);
          } catch (normalizedError) {
            setAnnotatedFailureDetails(normalizedError instanceof Error ? normalizedError.message : "Annotated export failed");
          }
        } else {
          setAnnotatedFailureDetails(error instanceof Error ? error.message : "Annotated export failed");
        }
      }

      setUploadJobs((current) => current.map((job) => (
        job.id === jobId
          ? {
              ...job,
              status: "completed",
              progress: 1,
              stageLabel: "Completed",
              completedAtIso: new Date().toISOString(),
              artefacts: {
                poseTimeline: timeline,
                processingSummary: buildAnalysisSummary(timeline),
                ...(annotated
                  ? {
                      annotatedVideoBlob: annotated.blob,
                      annotatedVideoMimeType: annotated.mimeType
                    }
                  : {})
              }
            }
          : job
      )));
      setAnalysisSessionsByJobId((current) => ({ ...current, [jobId]: completedSession }));
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      const message = error instanceof Error ? error.message : "Upload processing failed";
      setUploadJobs((current) => current.map((job) => (
        job.id === jobId
          ? {
              ...job,
              status: cancelled ? "cancelled" : "failed",
              stageLabel: cancelled ? "Cancelled" : "Failed",
              errorMessage: cancelled
                ? "Processing was cancelled for this video."
                : message === "Video preprocessing failed"
                  ? "Video preprocessing failed"
                  : "Processing failed. Retry to start a fresh local processing context.",
              errorDetails: message
            }
          : job
      )));
    } finally {
      activeAbortRef.current = null;
    }
  }, [cadenceFps, uploadJobs]);

  const enqueueFiles = useCallback(async (files: FileList | File[]) => {
    const videos = Array.from(files).filter((file) => file.type.startsWith("video/"));
    if (videos.length === 0) return;
    const createdAt = new Date().toISOString();
    const queuedJobs: UploadJob[] = await Promise.all(videos.map(async (file) => {
      const metadata = await readVideoMetadata(file);
      return {
        id: crypto.randomUUID(),
        file,
        fileName: file.name,
        fileSizeBytes: file.size,
        durationMs: metadata.durationMs,
        status: "queued",
        stageLabel: "Ready to analyze",
        progress: 0,
        createdAtIso: createdAt,
        drillSelection: createUploadJobDrillSelection({ selectedDrill })
      };
    }));

    setUploadJobs((current) => [...current, ...queuedJobs]);
    setSelectedJobId((current) => current ?? queuedJobs[0]?.id ?? null);
  }, [selectedDrill]);

  const openFileChooser = useCallback(() => {
    const fileInput = fileInputRef.current;
    if (!fileInput) return;
    clearFileInputValue(fileInput);
    fileInput.click();
  }, []);

  const resetUploadWorkflow = useCallback(() => {
    activeAbortRef.current?.abort();
    activeAbortRef.current = null;
    setUploadJobs([]);
    setSelectedJobId(null);
    setAnalysisSessionsByJobId({});
    setIsReferencePanelVisible(true);
    setTraceStepMs(DEFAULT_TRACE_STEP_MS);
    setShowRawDuringProcessing(false);
    setCompletedPreviewSurface("annotated");
    setAnnotatedFailureDetails(null);
    if (previewVideoRef.current) {
      previewVideoRef.current.pause();
      previewVideoRef.current.currentTime = 0;
    }
    if (fileInputRef.current) {
      clearFileInputValue(fileInputRef.current);
    }
    setWorkflowResetKey((current) => nextUploadWorkflowResetKey(current));
  }, []);

  useEffect(() => {
    const processingJob = uploadJobs.find((job) => job.status === "processing");
    if (processingJob || activeAbortRef.current) {
      return;
    }
    const nextQueued = uploadJobs.find((job) => job.status === "queued");
    if (!nextQueued) {
      return;
    }
    void startQueuedJob(nextQueued.id);
  }, [startQueuedJob, uploadJobs]);

  const activePhaseLabels = useMemo(() => buildPhaseLabelMap(activeJob?.drillSelection.drill), [activeJob?.drillSelection.drill]);
  const traceRows = useMemo(() => {
    if (!activeSession) return [];
    return summarizeTrace(activeSession, traceStepMs, activePhaseLabels);
  }, [activePhaseLabels, activeSession, traceStepMs]);

  const hasActiveUpload = activeJob?.status === "processing";
  const hasCompletedResult = activeJob?.status === "completed" && Boolean(activeJob.artefacts);
  const uploadPreviewState = resolveUnifiedResultPreviewState({
    hasRaw: Boolean(rawPreviewObjectUrl),
    hasAnnotated: Boolean(annotatedPreviewObjectUrl),
    isProcessingAnnotated: hasActiveUpload,
    annotatedFailed: Boolean(annotatedFailureDetails) && hasCompletedResult,
    userRequestedRawDuringProcessing: showRawDuringProcessing,
    preferredCompletedSurface: completedPreviewSurface
  });
  const canToggleCompletedSurfaces = canToggleCompletedPreview({
    hasRaw: Boolean(rawPreviewObjectUrl),
    hasAnnotated: Boolean(annotatedPreviewObjectUrl),
    isProcessingAnnotated: hasActiveUpload
  });
  const downloadTargets = resolveAvailableDownloads({
    hasRaw: Boolean(rawPreviewObjectUrl),
    hasAnnotated: Boolean(annotatedPreviewObjectUrl)
  });
  const previewSelection = selectPreviewSource({
    preferredId: uploadPreviewState === "showing_annotated_completed" ? "annotated" : "raw",
    sources: [
      ...(annotatedPreviewObjectUrl ? [{ id: "annotated" as const, url: annotatedPreviewObjectUrl, mimeType: activeJob?.artefacts?.annotatedVideoMimeType }] : []),
      ...(rawPreviewObjectUrl ? [{ id: "raw" as const, url: rawPreviewObjectUrl, mimeType: activeJob?.file?.type }] : [])
    ]
  });
  const preferredDeliverySource = selectPreferredDeliverySource([
    ...(activeJob?.artefacts?.annotatedVideoMimeType ? [{ id: "annotated" as const, url: annotatedPreviewObjectUrl ?? "", mimeType: activeJob.artefacts.annotatedVideoMimeType }] : []),
    ...(activeJob?.file?.type ? [{ id: "raw" as const, url: rawPreviewObjectUrl ?? "", mimeType: activeJob.file.type }] : [])
  ]);
  const downloadSafety = {
    annotated: activeJob?.artefacts?.annotatedVideoMimeType
      ? resolveSafeDelivery({ mimeType: activeJob.artefacts.annotatedVideoMimeType })
      : null,
    raw: activeJob?.file?.type ? resolveSafeDelivery({ mimeType: activeJob.file.type }) : null
  };
  const annotatedDownloadLabel = resolveUploadDownloadLabel({ kind: "annotated", downloadable: downloadSafety.annotated?.downloadable });
  const rawDownloadLabel = resolveUploadDownloadLabel({ kind: "raw", downloadable: downloadSafety.raw?.downloadable });
  const shouldCollapseReferencePanel = hasActiveUpload || hasCompletedResult;
  const showReferencePanel = isReferencePanelVisible;
  const queueHasMultiple = uploadJobs.length > 1;

  useEffect(() => {
    if (!activeJob) {
      return;
    }
    console.info("[upload-processing] PREVIEW_DELIVERY_SELECTION", {
      preferredSurface: uploadPreviewState,
      selectedSource: previewSelection.source?.id ?? "none",
      selectedMimeType: previewSelection.source?.mimeType ?? "unknown",
      appleFallbackTriggered: previewSelection.blockedByCompatibility,
      annotatedDownload: downloadSafety.annotated?.downloadable ?? "n/a",
      rawDownload: downloadSafety.raw?.downloadable ?? "n/a"
    });
  }, [activeJob, uploadPreviewState, previewSelection.source?.id, previewSelection.source?.mimeType, previewSelection.blockedByCompatibility, downloadSafety.annotated?.downloadable, downloadSafety.raw?.downloadable]);

  return (
    <section className="card" style={{ marginTop: "1rem", display: "grid", gap: "0.85rem" }}>
      <div className="card" style={{ margin: 0, background: "rgba(114,168,255,0.1)" }}>
        <strong>Local one-pass workflow</strong>
        <p className="muted" style={{ margin: "0.4rem 0 0" }}>
          Upload Video runs on this device using MediaPipe in your browser. This route is transient by design: upload, analyze, download outputs, and move on.
          Refreshing or leaving this page starts fresh.
        </p>
        <p className="muted" style={{ margin: "0.4rem 0 0" }}>
          Session mode: {persistenceMode === "cloud" ? "Signed-in cloud mode (with local fallback)." : "Browser-local mode."}
        </p>
      </div>

      <DrillSetupShell
        setupKey={workflowResetKey}
        showReferencePanel={showReferencePanel}
        leftPane={
          <div style={{ display: "grid", gap: "0.85rem" }}>
            <DrillSetupHeader
              title="Upload Video workflow"
              description={
                shouldCollapseReferencePanel
                  ? "Upload is active. Video and processing stay in the main workspace."
                  : "Reference animation is optional while you set up the upload."
              }
              showReferencePanel={showReferencePanel}
              onToggleReferencePanel={() => setIsReferencePanelVisible((current) => !current)}
              actions={
                <button type="button" onClick={openFileChooser} style={{ padding: "0.45rem 0.75rem", fontSize: "0.86rem" }}>
                  Choose video
                </button>
              }
            />
            <div className="card upload-workflow-action-card" style={{ margin: 0 }}>
            <div style={{ display: "grid", gap: "0.65rem" }}>
              <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
                <label className="muted" style={{ fontSize: "0.85rem" }}>
                  Analysis mode
                  <select
                    value={selectedSource}
                    onChange={(event) => setSelectedSource(event.target.value as DrillSourceKind)}
                    style={{ marginLeft: "0.35rem", minWidth: 155 }}
                    disabled={drillOptionsLoading}
                  >
                    {DRILL_SOURCE_ORDER.map((source) => (
                      <option key={source} value={source}>
                        {formatDrillSourceLabel(source)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="muted" style={{ fontSize: "0.85rem" }}>
                  Drill
                  <select
                    value={selectedDrillKey}
                    onChange={(event) => setSelectedDrillKey(event.target.value)}
                    style={{ marginLeft: "0.35rem", minWidth: 240 }}
                    disabled={drillOptionsLoading}
                  >
                    <option value={FREESTYLE_DRILL_KEY}>No drill · Freestyle overlay</option>
                    {(drillOptionGroups.get(selectedSource) ?? []).length === 0 ? (
                      <option value={FREESTYLE_DRILL_KEY} disabled>
                        No {formatDrillSourceLabel(selectedSource).toLowerCase()} drills available
                      </option>
                    ) : (
                      <optgroup label={`${formatDrillSourceLabel(selectedSource)} drills`}>
                        {(drillOptionGroups.get(selectedSource) ?? []).map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.displayLabel}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
                <label className="muted" style={{ fontSize: "0.85rem" }}>
                  Cadence FPS
                  <input
                    type="number"
                    min={4}
                    max={30}
                    value={cadenceFps}
                    onChange={(event) => setCadenceFps(Math.max(4, Math.min(30, Number(event.target.value) || DEFAULT_CADENCE_FPS)))}
                    style={{ marginLeft: "0.35rem", width: 70 }}
                  />
                </label>
              </div>

              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void enqueueFiles(event.dataTransfer.files);
                }}
                onClick={openFileChooser}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openFileChooser();
                  }
                }}
                role="button"
                tabIndex={0}
                className="card upload-workflow-dropzone"
                style={{ margin: 0 }}
              >
                <strong>Drop a video here or click to upload</strong>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>Uploads are queued locally on this page and run one at a time.</p>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: "0.84rem" }}>
                Freestyle mode is the default for reliable overlay output. Choose a drill only when you want rep/phase metrics.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                multiple
                style={{ display: "none" }}
                onChange={(event) => {
                  const files = event.currentTarget.files ? Array.from(event.currentTarget.files) : [];
                  clearFileInputValue(event.currentTarget);
                  if (files.length > 0) {
                    void enqueueFiles(files);
                  }
                }}
              />
            </div>
          </div>
          </div>
        }
        rightPane={
          <ReferenceAnimationPanel
            drill={selectedDrill?.drill ?? null}
            sourceKind={selectedDrill?.sourceKind}
            freestyleDescription="Upload Video will run pose overlay and export outputs without drill-specific rep, hold, or phase scoring."
          />
        }
      />
      {uploadJobs.length > 0 ? (
        <article className="card" style={{ margin: 0, padding: queueHasMultiple ? undefined : "0.8rem 1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
            <strong>{queueHasMultiple ? "Upload queue" : "Current upload job"}</strong>
            <button type="button" className="pill" onClick={resetUploadWorkflow}>Start fresh</button>
          </div>
          <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.55rem" }}>
            {uploadJobs.map((job) => {
              const selected = job.id === activeJob?.id;
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedJobId(job.id)}
                  style={{
                    textAlign: "left",
                    border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
                    borderRadius: "0.55rem",
                    background: selected ? "var(--accent-soft)" : "transparent",
                    padding: queueHasMultiple ? "0.6rem 0.75rem" : "0.55rem 0.7rem",
                    cursor: "pointer"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: "0.92rem" }}>{job.fileName}</strong>
                    <span className="muted" style={{ fontSize: "0.82rem", textTransform: "capitalize" }}>{job.status}</span>
                  </div>
                  <p className="muted" style={{ margin: "0.16rem 0 0", fontSize: "0.8rem" }}>
                    {formatBytes(job.fileSizeBytes)} • {formatDuration(job.durationMs)}
                  </p>
                  <p className="muted" style={{ margin: "0.16rem 0 0", fontSize: "0.8rem" }}>{job.stageLabel}</p>
                  {(job.status === "processing" || job.status === "queued") ? <progress max={1} value={job.progress} style={{ width: "100%", marginTop: "0.3rem" }} /> : null}
                </button>
              );
            })}
          </div>
          {activeJob ? (
            <div style={{ marginTop: "0.55rem", display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
              {activeJob.status === "processing" ? <button type="button" className="pill" onClick={() => activeAbortRef.current?.abort()}>Cancel</button> : null}
              {(activeJob.status === "failed" || activeJob.status === "cancelled") ? (
                <button
                  type="button"
                  className="pill"
                  onClick={() => {
                    const retryJobId = activeJob.id;
                    setUploadJobs((current) => {
                      const retryTarget = current.find((job) => job.id === retryJobId);
                      if (!retryTarget) return current;
                      const withoutRetryTarget = current.filter((job) => job.id !== retryJobId);
                      return [{ ...retryTarget, status: "queued", stageLabel: "Ready to analyze", progress: 0, errorMessage: undefined, errorDetails: undefined }, ...withoutRetryTarget];
                    });
                    setSelectedJobId(retryJobId);
                  }}
                >
                  Retry
                </button>
              ) : null}
              {activeJob.errorMessage ? <span style={{ color: "#f0b47d", fontSize: "0.85rem" }}>{activeJob.errorMessage}</span> : null}
            </div>
          ) : null}
        </article>
      ) : null}

          {activeJob ? (
            <section className="card" style={{ margin: 0 }}>
              <h3 style={{ marginTop: 0 }}>Analysis result</h3>
              {uploadPreviewState === "processing_annotated" ? (
                <div className="result-preview-processing">
                  <strong>Generating annotated video for the selected upload.</strong>
                  <p className="muted" style={{ margin: "0.2rem 0 0" }}>Raw preview is available while render completes.</p>
                  <progress max={1} value={activeJob.progress} style={{ width: "100%", marginTop: "0.35rem", maxWidth: 360 }} />
                  <button type="button" className="pill" onClick={() => setShowRawDuringProcessing(true)}>Show raw instead</button>
                </div>
              ) : null}
              {uploadPreviewState === "annotated_failed_showing_raw" ? (
                <div className="result-preview-warning">
                  <strong>Annotated video could not be generated. Your raw video is still available.</strong>
                  {annotatedFailureDetails ? (
                    <details style={{ marginTop: "0.3rem" }}>
                      <summary className="muted" style={{ cursor: "pointer" }}>Technical details</summary>
                      <pre className="muted" style={{ whiteSpace: "pre-wrap", marginTop: "0.35rem" }}>{annotatedFailureDetails}</pre>
                    </details>
                  ) : null}
                </div>
              ) : null}
              {previewSelection.warning ? (
                <div className="result-preview-warning" style={{ marginTop: "0.4rem" }}>
                  <strong>{previewSelection.warning}</strong>
                </div>
              ) : null}
              {(uploadPreviewState === "showing_raw_completed" || uploadPreviewState === "showing_annotated_completed" || uploadPreviewState === "showing_raw_during_processing" || uploadPreviewState === "annotated_failed_showing_raw") && previewSelection.source ? (
              <div
                ref={fullscreenContainerRef}
                style={{ position: "relative", width: "100%", maxWidth: "min(100%, 1100px)", maxHeight: "72vh", aspectRatio: "16 / 9", borderRadius: "0.6rem", overflow: "hidden" }}
              >
                <video
                  ref={previewVideoRef}
                  src={previewSelection.source?.url}
                  controls
                  playsInline
                  disablePictureInPicture
                  controlsList="nofullscreen noremoteplayback"
                  style={{ width: "100%", height: "100%", objectFit: "contain", background: "#020617" }}
                />
                {(uploadPreviewState === "showing_raw_completed" || uploadPreviewState === "showing_raw_during_processing" || uploadPreviewState === "annotated_failed_showing_raw") ? (
                  <canvas ref={previewCanvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
                ) : null}
              </div>
              ) : null}
              {canToggleCompletedSurfaces ? (
                <div style={{ marginTop: "0.45rem", display: "inline-flex", border: "1px solid var(--border)", borderRadius: "999px", overflow: "hidden" }}>
                  <button
                    type="button"
                    className="studio-button"
                    style={{ border: "none", borderRadius: 0, background: completedPreviewSurface === "annotated" ? "var(--accent-soft)" : "transparent" }}
                    onClick={() => setCompletedPreviewSurface("annotated")}
                  >
                    Annotated
                  </button>
                  <button
                    type="button"
                    className="studio-button"
                    style={{ border: "none", borderRadius: 0, background: completedPreviewSurface === "raw" ? "var(--accent-soft)" : "transparent" }}
                    onClick={() => setCompletedPreviewSurface("raw")}
                  >
                    Raw
                  </button>
                </div>
              ) : null}
              {previewSelection.source ? (
                <div style={{ marginTop: "0.45rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                  <span className="muted" style={{ fontSize: "0.82rem" }}>Use Overlay Fullscreen to keep pose + HUD visible together.</span>
                  <button
                    type="button"
                    className="pill"
                    onClick={async () => {
                      if (!fullscreenContainerRef.current) return;
                      if (document.fullscreenElement) {
                        await document.exitFullscreen();
                        return;
                      }
                      await fullscreenContainerRef.current.requestFullscreen();
                    }}
                  >
                    Overlay Fullscreen
                  </button>
                </div>
              ) : null}

              {activeJob.artefacts && activeSession && (activeJob.drillSelection.mode ?? "drill") === "drill" ? (
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
                  <span className="pill">
                    Phase: {(() => {
                      const phaseId = activeSession.events.at(-1)?.phaseId;
                      if (!phaseId) return "No phase detected";
                      return activePhaseLabels[phaseId] ?? phaseId;
                    })()}
                  </span>
                  <span className="pill">Reps: {activeSession.summary.repCount ?? 0}</span>
                  <span className="pill">Hold: {(activeSession.summary.holdDurationMs ?? 0) > 0 ? formatDuration(activeSession.summary.holdDurationMs) : "No holds detected"}</span>
                  <span className="pill">Analyzed duration: {formatDuration(activeSession.summary.analyzedDurationMs)}</span>
                  <span className="pill">Confidence: {formatConfidence(activeSession.summary.confidenceAvg)}</span>
                  {activeJob.drillSelection.cameraView ? (
                    <span className="pill">Camera View: {formatCameraViewLabel(activeJob.drillSelection.cameraView)}</span>
                  ) : null}
                  <span className="pill">Result: {activeSession.status}</span>
                </div>
              ) : activeJob.artefacts ? (
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
                  <span className="pill">Mode: No drill · Freestyle overlay</span>
                  <span className="pill">Analyzed duration: {formatDuration(activeJob.artefacts.processingSummary.durationMs)}</span>
                </div>
              ) : null}

              {activeJob.artefacts ? (
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
                {preferredDeliverySource ? <span className="muted" style={{ fontSize: "0.8rem", width: "100%" }}>Recommended delivery: {preferredDeliverySource.id === "annotated" ? "Annotated" : "Raw"}</span> : null}
                {downloadTargets.includes("annotated") ? (
                  <button
                    type="button"
                    className="pill"
                    onClick={() => downloadBlob(activeJob.artefacts!.annotatedVideoBlob!, `${createArtifactBaseName(activeJob.fileName)}.annotated-video.${extensionFromMimeType(activeJob.artefacts?.annotatedVideoMimeType)}`)}
                    title={downloadSafety.annotated?.warning ?? undefined}
                  >
                    {annotatedDownloadLabel}
                  </button>
                ) : null}
                {downloadTargets.includes("raw") ? (
                  <button type="button" className="pill" onClick={() => downloadBlob(activeJob.file, activeJob.fileName)} title={downloadSafety.raw?.warning ?? undefined}>
                    {rawDownloadLabel}
                  </button>
                ) : null}
                {downloadSafety.annotated?.warning ? <span className="muted" style={{ fontSize: "0.8rem" }}>{downloadSafety.annotated.warning}</span> : null}
                {downloadSafety.raw?.warning ? <span className="muted" style={{ fontSize: "0.8rem" }}>{downloadSafety.raw.warning}</span> : null}
                <button
                  type="button"
                  className="pill"
                  onClick={() => downloadBlob(new Blob([JSON.stringify(activeJob.artefacts?.processingSummary, null, 2)], { type: "application/json" }), `${createArtifactBaseName(activeJob.fileName)}.processing-summary.json`)}
                >
                  Download Processing Summary (.json)
                </button>
                <button
                  type="button"
                  className="pill"
                  onClick={() => downloadBlob(new Blob([JSON.stringify(activeJob.artefacts?.poseTimeline, null, 2)], { type: "application/json" }), `${createArtifactBaseName(activeJob.fileName)}.pose-timeline.json`)}
                >
                  Download Pose Timeline (.json)
                </button>
              </div>
              ) : null}
            </section>
      ) : null}

      {activeSession && (activeJob?.drillSelection.mode ?? "drill") === "drill" ? (
        <details style={{ marginTop: "0.2rem", opacity: 0.88 }}>
          <summary style={{ cursor: "pointer" }}>Advanced diagnostics (optional)</summary>
          <p className="muted" style={{ marginTop: "0.35rem" }}>Use these only for deeper troubleshooting after reviewing the main result and downloads.</p>

          <details style={{ marginTop: "0.35rem", opacity: 0.95 }}>
            <summary style={{ cursor: "pointer" }}>Temporal trace</summary>
            <div style={{ marginTop: "0.4rem", display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
              <span className="muted">Granularity</span>
              <select value={traceStepMs} onChange={(event) => setTraceStepMs(Number(event.target.value))}>
                {TRACE_STEP_OPTIONS.map((option) => (
                  <option key={option} value={option}>{formatTraceStepLabel(option)}</option>
                ))}
              </select>
            </div>
            {traceRows.length === 0 ? (
              <p className="muted">No frame samples available for this run.</p>
            ) : !isMeaningfullyVariant(traceRows) ? (
              <p className="muted">No meaningful temporal changes at this interval.</p>
            ) : (
              <ol className="muted" style={{ marginBottom: "0.45rem" }}>
                {traceRows.map((row) => (
                  <li key={`trace-${row.timestampMs}`}>
                    {formatDurationShort(row.timestampMs)} • phase={row.phase} • reps={row.repCount} • confidence={row.confidence.toFixed(2)}
                  </li>
                ))}
              </ol>
            )}
          </details>

          {activeSession.events.length > 0 ? (
            <details style={{ marginTop: "0.35rem", opacity: 0.95 }}>
              <summary style={{ cursor: "pointer" }}>Events</summary>
              <ol className="muted">
                {activeSession.events.map((event) => (
                  <li key={event.eventId} style={{ marginBottom: "0.25rem" }}>
                    {formatDiagnosticEvent(event, activePhaseLabels)} @ {formatDurationShort(event.timestampMs)}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}

          {activeSession.debug?.runtimeDiagnostics ? (
            <details style={{ marginTop: "0.35rem", opacity: 0.95 }}>
              <summary style={{ cursor: "pointer" }}>Runtime diagnostic summary</summary>
              <ul className="muted" style={{ marginTop: "0.35rem" }}>
                <li>You have {activeSession.debug.runtimeDiagnostics.phaseCount ?? activeSession.debug.runtimeDiagnostics.expectedPhaseOrder.length} phases.</li>
                <li>Derived loop: {(activeSession.debug.runtimeDiagnostics.expectedLoop ?? activeSession.debug.runtimeDiagnostics.expectedPhaseOrder.join(" → ")) || "n/a"}</li>
                <li>Allowed transitions: {activeSession.debug.runtimeDiagnostics.allowedTransitions.join(", ") || "n/a"}</li>
                <li>Current phase: {activeSession.debug.runtimeDiagnostics.currentPhase ?? "none"}</li>
                <li>Expected next phase: {activeSession.debug.runtimeDiagnostics.expectedNextPhase ?? "n/a"}</li>
                <li>Attempted phase: {activeSession.debug.runtimeDiagnostics.attemptedNextPhase ?? "n/a"}</li>
                <li>
                  Rejected reason:{" "}
                  {activeSession.debug.runtimeDiagnostics.rejectedReason
                    ? formatTransitionReason(activeSession.debug.runtimeDiagnostics.rejectedReason)
                    : "n/a"}
                </li>
                <li>Mode rule: {activeSession.debug.runtimeDiagnostics.modeSummary ?? "n/a"}</li>
                <li>
                  Legacy sequence mismatch:{" "}
                  {activeSession.debug.runtimeDiagnostics.legacyOrderMismatch
                    ? `yes (${(activeSession.debug.runtimeDiagnostics.legacyOrderMismatchDetails ?? []).join(", ") || "details unavailable"})`
                    : "no"}
                </li>
                <li>
                  No-rep reason:{" "}
                  {activeSession.debug.runtimeDiagnostics.noRepReason
                    ? formatTransitionReason(activeSession.debug.runtimeDiagnostics.noRepReason)
                    : "n/a"}
                </li>
                <li>Last rep event: {activeSession.debug.runtimeDiagnostics.lastRepCompleted ?? "none"}</li>
              </ul>
            </details>
          ) : null}

          <details style={{ marginTop: "0.35rem", opacity: 0.9 }}>
            <summary style={{ cursor: "pointer" }}>Deep inspection table</summary>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.45rem" }}>
                <thead>
                  <tr className="muted">
                    <th style={{ textAlign: "left" }}>t(s)</th>
                    <th style={{ textAlign: "left" }}>best phase</th>
                    <th style={{ textAlign: "left" }}>score</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSession.frameSamples.slice(0, 120).map((sample) => (
                    <tr key={`sample-${sample.timestampMs}`}>
                      <td>{formatDurationShort(sample.timestampMs)}</td>
                      <td>{resolvePhaseLabel(sample.classifiedPhaseId, activePhaseLabels)}</td>
                      <td>{sample.confidence.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <details style={{ marginTop: "0.35rem", opacity: 0.85 }}>
            <summary style={{ cursor: "pointer" }}>Debug and pipeline details</summary>
            <p className="muted" style={{ marginTop: "0.35rem" }}>Additional diagnostics are intentionally collapsed for normal Upload Video flow.</p>
          </details>
        </details>
      ) : null}
    </section>
  );
}
