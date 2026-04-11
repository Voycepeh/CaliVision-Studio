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
import { resolveAvailableDownloads, resolveUnifiedResultPreviewState, type PreviewSurface } from "@/lib/results/preview-state";
import { extensionFromMimeType, resolveSafeDelivery, selectPreferredDeliverySource, selectPreviewSource } from "@/lib/media/media-capabilities";
import { resolveUploadDownloadLabel } from "@/lib/media/download-labels";
import { mapUploadAnalysisToViewerModel } from "@/lib/analysis-viewer/adapters";
import { seekVideoToTimestamp } from "@/lib/analysis-viewer/behavior";
import type { PortableDrill } from "@/lib/schema/contracts";
import { DrillSetupHeader } from "@/components/workflow-setup/DrillSetupHeader";
import { DrillSetupShell } from "@/components/workflow-setup/DrillSetupShell";
import { ReferenceAnimationPanel } from "@/components/workflow-setup/ReferenceAnimationPanel";
import { readActiveDrillContext, setActiveDrillContext } from "@/lib/workflow/drill-context";
import { useAvailableDrills } from "@/lib/workflow/use-available-drills";
import { AnalysisViewerShell } from "@/components/analysis-viewer/AnalysisViewerShell";

const DEFAULT_CADENCE_FPS = 12;
const SELECTED_DRILL_STORAGE_KEY = "upload.selected-drill";
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
  const [selectedViewerEventId, setSelectedViewerEventId] = useState<string | null>(null);
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
    setSelectedViewerEventId(null);
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
                processingSummary: buildAnalysisSummary(timeline, annotated?.diagnostics),
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
    setSelectedViewerEventId(null);
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
  const previewUrl = previewSelection.source?.url ?? null;

  useEffect(() => {
    const events = activeSession?.events ?? [];
    if (events.length === 0) {
      setSelectedViewerEventId(null);
      return;
    }
    setSelectedViewerEventId((current) => (current && events.some((event) => event.eventId === current) ? current : events[0].eventId));
  }, [activeSession]);

  const uploadViewerModel = useMemo(
    () =>
      mapUploadAnalysisToViewerModel({
        previewState: uploadPreviewState,
        videoUrl: previewUrl,
        canShowVideo: Boolean(previewUrl),
        surface: completedPreviewSurface,
        selectedEventId: selectedViewerEventId,
        session: activeSession,
        durationMs: activeSession?.summary.analyzedDurationMs ?? activeJob?.durationMs,
        mediaAspectRatio:
          activeJob?.artefacts?.poseTimeline.video.width && activeJob.artefacts.poseTimeline.video.height
            ? activeJob.artefacts.poseTimeline.video.width / activeJob.artefacts.poseTimeline.video.height
            : undefined,
        primarySummaryChips:
          activeJob?.artefacts && activeSession && (activeJob.drillSelection.mode ?? "drill") === "drill"
            ? [
                { id: "drill", label: "Drill", value: activeJob.drillSelection.drillBinding.drillName || "Selected drill" },
                {
                  id: "phase",
                  label: "Phase result",
                  value: (() => {
                    const phaseId = activeSession.events.at(-1)?.phaseId;
                    if (!phaseId) return "No phase transitions detected";
                    return activePhaseLabels[phaseId] ?? phaseId;
                  })()
                },
                { id: "reps", label: "Reps", value: String(activeSession.summary.repCount ?? 0) },
                {
                  id: "hold",
                  label: "Hold",
                  value: (activeSession.summary.holdDurationMs ?? 0) > 0 ? formatDuration(activeSession.summary.holdDurationMs) : "No holds detected"
                },
                { id: "duration", label: "Duration", value: formatDuration(activeSession.summary.analyzedDurationMs) }
              ]
            : activeJob?.artefacts
              ? [
                  { id: "mode", label: "Mode", value: "Freestyle (no drill selected)" },
                  { id: "duration", label: "Duration", value: formatDuration(activeJob.artefacts.processingSummary.durationMs) },
                  { id: "phase", label: "Phase result", value: "No phase transitions detected" }
                ]
              : [],
        technicalStatusChips:
          activeJob?.artefacts && activeSession
            ? [
                { id: "replay", label: "Replay", value: uploadPreviewState.includes("showing") ? "Available" : "Unavailable" },
                { id: "confidence", label: "Confidence", value: formatConfidence(activeSession.summary.confidenceAvg) },
                ...(activeJob.drillSelection.cameraView ? [{ id: "camera", label: "Camera view", value: formatCameraViewLabel(activeJob.drillSelection.cameraView) }] : []),
                { id: "status", label: "Run status", value: activeSession.status }
              ]
            : [],
        downloads: [
          ...(downloadTargets.includes("annotated") && activeJob?.artefacts?.annotatedVideoBlob
            ? [{
                id: "download_annotated",
                label: annotatedDownloadLabel,
                onDownload: () =>
                  downloadBlob(
                    activeJob.artefacts!.annotatedVideoBlob!,
                    `${createArtifactBaseName(activeJob.fileName)}.annotated-video.${extensionFromMimeType(activeJob.artefacts?.annotatedVideoMimeType)}`
                  ),
                hint: downloadSafety.annotated?.warning ?? undefined
              }]
            : []),
          ...(downloadTargets.includes("raw") && activeJob
            ? [{ id: "download_raw", label: rawDownloadLabel, onDownload: () => downloadBlob(activeJob.file, activeJob.fileName), hint: downloadSafety.raw?.warning ?? undefined }]
            : []),
          ...(activeJob?.artefacts
            ? [
                {
                  id: "processing_summary",
                  label: "Download Processing Summary (.json)",
                  onDownload: () =>
                    downloadBlob(
                      new Blob([JSON.stringify(activeJob.artefacts?.processingSummary, null, 2)], { type: "application/json" }),
                      `${createArtifactBaseName(activeJob.fileName)}.processing-summary.json`
                    )
                },
                {
                  id: "pose_timeline",
                  label: "Download Pose Timeline (.json)",
                  onDownload: () =>
                    downloadBlob(
                      new Blob([JSON.stringify(activeJob.artefacts?.poseTimeline, null, 2)], { type: "application/json" }),
                      `${createArtifactBaseName(activeJob.fileName)}.pose-timeline.json`
                    )
                }
              ]
            : [])
        ],
        diagnosticsSections:
          activeSession && (activeJob?.drillSelection.mode ?? "drill") === "drill"
            ? [
                {
                  id: "events",
                  title: "Events",
                  content: activeSession.events.map((event) => `${formatDiagnosticEvent(event, activePhaseLabels)} @ ${formatDurationShort(event.timestampMs)}`)
                },
                { id: "trace", title: "Temporal trace", content: traceRows.slice(0, 24).map((row) => `${formatDurationShort(row.timestampMs)} • phase=${row.phase} • reps=${row.repCount}`) }
              ]
            : [],
        warnings: [previewSelection.warning, downloadSafety.annotated?.warning, downloadSafety.raw?.warning].filter((value): value is string => Boolean(value)),
        recommendedDeliveryLabel: preferredDeliverySource ? `Recommended delivery: ${preferredDeliverySource.id === "annotated" ? "Annotated" : "Raw"}` : undefined,
        overlayFullscreenAction: previewUrl
          ? {
              label: "Overlay Fullscreen",
              onToggle: async () => {
                if (!fullscreenContainerRef.current) return;
                if (document.fullscreenElement) {
                  await document.exitFullscreen();
                  return;
                }
                await fullscreenContainerRef.current.requestFullscreen();
              }
            }
          : undefined
      }),
    [
      uploadPreviewState,
      previewUrl,
      completedPreviewSurface,
      selectedViewerEventId,
      activeSession,
      activeJob,
      activePhaseLabels,
      downloadTargets,
      annotatedDownloadLabel,
      downloadSafety.annotated?.warning,
      rawDownloadLabel,
      downloadSafety.raw?.warning,
      traceRows,
      previewSelection.warning,
      preferredDeliverySource
    ]
  );

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
              <div ref={fullscreenContainerRef}>
                <AnalysisViewerShell
                  model={{ ...uploadViewerModel, progress: uploadPreviewState === "processing_annotated" ? activeJob.progress : undefined }}
                  videoRef={previewVideoRef}
                  overlayCanvas={(uploadPreviewState === "showing_raw_completed" || uploadPreviewState === "showing_raw_during_processing" || uploadPreviewState === "annotated_failed_showing_raw") ? <canvas ref={previewCanvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} /> : undefined}
                  onSurfaceChange={(surface) => {
                    setCompletedPreviewSurface(surface);
                    if (hasActiveUpload) {
                      setShowRawDuringProcessing(surface === "raw");
                    }
                  }}
                  onEventSelect={(event) => {
                    setSelectedViewerEventId(event.id);
                    seekVideoToTimestamp(previewVideoRef.current, event.timestampMs);
                  }}
                />
              </div>
            </section>
      ) : null}
    </section>
  );
}
