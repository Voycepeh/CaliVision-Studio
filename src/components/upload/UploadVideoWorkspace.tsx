"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { deriveReplayOverlayStateAtTime } from "@/lib/analysis/replay-state";
import { resolvePhaseLabel } from "@/lib/analysis/event-labels";
import { drawAnalysisOverlay, drawCoachingOverlay, drawPoseOverlay, getNearestPoseFrame } from "@/lib/workflow/pose-overlay";
import { createCenterOfGravityTracker } from "@/lib/workflow/center-of-gravity";
import { buildAnalysisSummary, exportAnnotatedVideo, processVideoFile, readVideoMetadata } from "@/lib/upload/processing";
import { fitVideoContainRect } from "@/lib/upload/video-layout";
import { createOverlayProjection } from "@/lib/live/overlay-geometry";
import type { UploadJob } from "@/lib/upload/types";
import { clearFileInputValue, DEFAULT_TRACE_STEP_MS, nextUploadWorkflowResetKey } from "@/lib/upload/workflow-reset";
import { createUploadJobDrillSelection } from "@/lib/upload/drill-selection";
import { inspectUploadCompatibility, type UploadCompatibilityReport, type UploadPreflightDecision } from "@/lib/upload/compatibility";
import {
  buildBenchmarkCoachingFeedback,
  buildVisualCoachingFeedback,
  buildCompletedUploadAnalysisSession,
  buildPhaseRuntimeModel,
  buildReplayAnalysisState,
  formatCameraViewLabel,
  formatPhaseSequenceSummary,
  type AnalysisSessionRecord
} from "@/lib/analysis";
import { formatDurationShort } from "@/lib/format/duration";
import { formatDurationClock, toFiniteNonNegativeMs } from "@/lib/format/safe-duration";
import { resolveUnifiedResultPreviewState, type PreviewSurface } from "@/lib/results/preview-state";
import { resolveResultDownloadTargets } from "@/lib/results/download-actions";
import { extensionFromMimeType, resolveSafeDelivery, selectPreferredDeliverySource, selectPreviewSource } from "@/lib/media/media-capabilities";
import { resolveUploadDownloadLabel } from "@/lib/media/download-labels";
import { mapUploadAnalysisToViewerModel } from "@/lib/analysis-viewer/adapters";
import { buildAnalysisReviewModel } from "@/lib/analysis-viewer/review-model";
import { buildSavedAttemptSummary } from "@/lib/history/attempt-summary";
import { getBrowserAttemptHistoryRepository } from "@/lib/history/repository";
import { buildAnalysisDomainModel, buildAnalysisPanelModel } from "@/lib/analysis-viewer/analysis-domain";
import { formatAnnotatedRenderProgressLabel, parseFrameProgress } from "@/lib/analysis-viewer/progress-status";
import { seekVideoToTimestamp } from "@/lib/analysis-viewer/behavior";
import { getReplayStateMessage, getReplayStateTone, type ReplayTerminalState } from "@/lib/live/results-summary";
import type { PortableDrill } from "@/lib/schema/contracts";
import { DrillSetupHeader } from "@/components/workflow-setup/DrillSetupHeader";
import { DrillSetupShell } from "@/components/workflow-setup/DrillSetupShell";
import { ReferenceAnimationPanel } from "@/components/workflow-setup/ReferenceAnimationPanel";
import { CaptureSetupGuidance } from "@/components/workflow-setup/CaptureSetupGuidance";
import { DrillComboboxField, DrillOriginSelectField } from "@/components/workflow-setup/DrillOriginSelector";
import { readActiveDrillContext, setActiveDrillContext } from "@/lib/workflow/drill-context";
import { useAvailableDrills } from "@/lib/workflow/use-available-drills";
import { AnalysisViewerShell } from "@/components/analysis-viewer/AnalysisViewerShell";
import { writeCompareHandoffPayload } from "@/lib/compare/compare-handoff";
import { deriveComparisonStatusView } from "@/lib/compare/compare-model";
import { isFullOrderedPhaseMatch } from "@/lib/analysis/benchmark-feedback";

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

function formatExpectedViewLabel(view: PortableDrill["primaryView"]): string {
  if (view === "front") return "Front";
  if (view === "rear") return "Rear";
  return "Side";
}

function formatCompatibilityReason(reason: string): string {
  if (reason === "incomplete or low-confidence metadata") {
    return "Preparing video";
  }
  if (reason === "QuickTime/MOV container can include fragile metadata") {
    return "Analyzing video";
  }
  if (reason === "portrait source has non-zero rotation metadata" || reason === "suspicious or incomplete metadata") {
    return "Normalizing video and retrying…";
  }
  return reason;
}

function shouldAutoResolvePreflight(report: UploadCompatibilityReport): boolean {
  const metadataOnlyReasons = new Set([
    "incomplete or low-confidence metadata",
    "QuickTime/MOV container can include fragile metadata",
    "portrait source has non-zero rotation metadata",
    "suspicious or incomplete metadata"
  ]);
  return report.level === "risky" && report.reasons.length > 0 && report.reasons.every((reason) => metadataOnlyReasons.has(reason));
}

function resolveUploadReplayState(job: UploadJob | null | undefined, previewState: string): ReplayTerminalState {
  if (!job) return "idle";
  if (job.status === "processing" || previewState.includes("processing")) return "export-in-progress";
  if (job.status === "failed" || job.status === "cancelled") return "export-failed";
  if (job.status === "completed" && job.artefacts?.annotatedVideoBlob) return "annotated-ready";
  if (job.status === "completed") return "raw-fallback";
  return "idle";
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
    case "skipped_required_phase":
      return "skipped required phase";
    case "broken_sequence":
      return "broken phase sequence";
    case "abandoned_attempt":
      return "rep was started but not completed";
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
  const router = useRouter();
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
  const centerOfGravityTrackerRef = useRef(createCenterOfGravityTracker());
  const [rawPreviewState, setRawPreviewState] = useState<{ jobId: string; url: string; mimeType?: string; fileName: string } | null>(null);
  const [annotatedPreviewState, setAnnotatedPreviewState] = useState<{ jobId: string; url: string } | null>(null);
  const [showRawDuringProcessing, setShowRawDuringProcessing] = useState(false);
  const [completedPreviewSurface, setCompletedPreviewSurface] = useState<PreviewSurface>("annotated");
  const [replayTimestampMs, setReplayTimestampMs] = useState(0);
  const [annotatedFailureDetails, setAnnotatedFailureDetails] = useState<string | null>(null);
  const [isReferencePanelVisible, setIsReferencePanelVisible] = useState(true);
  const [workflowResetKey, setWorkflowResetKey] = useState(0);
  const [preflightPrompt, setPreflightPrompt] = useState<{ file: File; report: UploadCompatibilityReport } | null>(null);
  const [attemptSaveState, setAttemptSaveState] = useState<"idle" | "saved" | "error">("idle");
  const preflightResolverRef = useRef<((choice: UploadPreflightDecision) => void) | null>(null);
  const savedAttemptJobIdsRef = useRef<Set<string>>(new Set());
  const activeJob = useMemo(
    () => (selectedJobId ? uploadJobs.find((job) => job.id === selectedJobId) ?? null : uploadJobs[0] ?? null),
    [selectedJobId, uploadJobs]
  );
  const activeSession = useMemo(
    () => (activeJob ? analysisSessionsByJobId[activeJob.id] ?? null : null),
    [activeJob, analysisSessionsByJobId]
  );
  const rawPreviewObjectUrl = activeJob && rawPreviewState?.jobId === activeJob.id ? rawPreviewState.url : null;
  const annotatedPreviewObjectUrl = activeJob && annotatedPreviewState?.jobId === activeJob.id ? annotatedPreviewState.url : null;
  const rawPreviewMimeType = activeJob && rawPreviewState?.jobId === activeJob.id ? rawPreviewState.mimeType : undefined;
  const rawPreviewFileName = activeJob && rawPreviewState?.jobId === activeJob.id ? rawPreviewState.fileName : undefined;
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
      setRawPreviewState((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return null;
      });
      setAnnotatedPreviewState((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return null;
      });
      return;
    }

    const rawPreviewFile = activeJob.artefacts?.analysisVideoFile ?? activeJob.file;
    const rawUrl = URL.createObjectURL(rawPreviewFile);
    setRawPreviewState((previous) => {
      if (previous) URL.revokeObjectURL(previous.url);
      return {
        jobId: activeJob.id,
        url: rawUrl,
        mimeType: rawPreviewFile.type || undefined,
        fileName: rawPreviewFile.name || activeJob.fileName
      };
    });

    if (activeJob.artefacts?.annotatedVideoBlob) {
      const annotatedUrl = URL.createObjectURL(activeJob.artefacts.annotatedVideoBlob);
      setAnnotatedPreviewState((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return {
          jobId: activeJob.id,
          url: annotatedUrl
        };
      });
    } else {
      setAnnotatedPreviewState((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return null;
      });
    }
  }, [activeJob]);

  useEffect(() => {
    centerOfGravityTrackerRef.current.reset();
  }, [activeJob?.id]);

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
      drawPoseOverlay(ctx, containerWidth, containerHeight, frame, {
        projection,
        centerOfGravityTracker: centerOfGravityTrackerRef.current
      });
      if ((activeJob.drillSelection.mode ?? "drill") === "drill" && activeSession) {
        drawCoachingOverlay(
          ctx,
          containerWidth,
          containerHeight,
          frame,
          buildVisualCoachingFeedback({
            session: activeSession,
            benchmarkFeedback: activeSession.benchmarkComparison
              ? buildBenchmarkCoachingFeedback({ comparison: activeSession.benchmarkComparison })
              : null,
            drill: activeJob.drillSelection.drill,
            replayState: buildReplayAnalysisState({
              session: activeSession,
              phaseLabelsById: buildPhaseLabelMap(activeJob.drillSelection.drill),
              timestampMs: currentMs
            }),
            frame,
            timestampMs: currentMs
          }),
          { projection }
        );
      }
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
      stageLabel: "Checking compatibility",
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
        normalizationStrategy:
          processingJob.preflightChoice === "normalize"
            ? "force"
            : processingJob.preflightChoice === "try_anyway"
              ? "off"
              : "auto",
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
              stageLabel: analysisSourceKind === "normalized" ? "Generating annotated video (normalized source)" : "Generating annotated video"
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

      const exportSourceFile = analysisSourceKind === "normalized" ? analysisFile : processingJob.file;
      const fallbackExportSourceFile = analysisSourceKind === "normalized" ? processingJob.file : null;
      let annotated: Awaited<ReturnType<typeof exportAnnotatedVideo>> | null = null;
      try {
        annotated = await exportAnnotatedVideo(exportSourceFile, timeline, {
          ...overlayOptions,
          analysisSourceKind,
          exportSourceFileName: exportSourceFile.name,
          onProgress: (progress, stageLabel) => {
            const nextLabel = formatAnnotatedRenderProgressLabel({ stageLabel, completed: false }) ?? stageLabel;
            setUploadJobs((current) => current.map((job) => (job.id === jobId ? { ...job, progress, stageLabel: nextLabel } : job)));
          }
        });
      } catch (error) {
        if (fallbackExportSourceFile) {
          console.info("[upload-processing] ANNOTATED_EXPORT_FALLBACK_ORIGINAL_SOURCE", {
            fileName: processingJob.fileName,
            reason: error instanceof Error ? error.message : "unknown"
          });
          try {
            annotated = await exportAnnotatedVideo(fallbackExportSourceFile, timeline, {
              ...overlayOptions,
              analysisSourceKind,
              exportSourceFileName: fallbackExportSourceFile.name,
              onProgress: (progress, stageLabel) => {
                const nextLabel = formatAnnotatedRenderProgressLabel({ stageLabel, completed: false }) ?? stageLabel;
                setUploadJobs((current) => current.map((job) => (job.id === jobId ? { ...job, progress, stageLabel: nextLabel } : job)));
              }
            });
          } catch (fallbackError) {
            setAnnotatedFailureDetails(fallbackError instanceof Error ? fallbackError.message : "Annotated export failed");
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
              stageLabel: formatAnnotatedRenderProgressLabel({
                stageLabel: annotated?.diagnostics
                  ? `Rendering frames ${annotated.diagnostics.renderedFrameCount}/${Math.max(1, Math.floor(annotated.diagnostics.sourceDurationSec * annotated.diagnostics.renderFpsTarget) + 1)}`
                  : "Annotated export complete",
                completed: true
              }) ?? "Completed",
              completedAtIso: new Date().toISOString(),
              artefacts: {
                analysisSourceKind,
                ...(analysisSourceKind === "normalized" ? { analysisVideoFile: analysisFile } : {}),
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

  const requestPreflightChoice = useCallback((file: File, report: UploadCompatibilityReport): Promise<UploadPreflightDecision> => {
    setPreflightPrompt({ file, report });
    return new Promise<UploadPreflightDecision>((resolve) => {
      preflightResolverRef.current = resolve;
    });
  }, []);

  const resolvePreflightChoice = useCallback((choice: UploadPreflightDecision) => {
    const resolver = preflightResolverRef.current;
    preflightResolverRef.current = null;
    setPreflightPrompt(null);
    resolver?.(choice);
  }, []);

  const enqueueFiles = useCallback(async (files: FileList | File[]) => {
    const videos = Array.from(files).filter((file) => file.type.startsWith("video/"));
    if (videos.length === 0) return;
    const createdAt = new Date().toISOString();
    const queuedJobs: UploadJob[] = [];

    for (const file of videos) {
      const compatibility = await inspectUploadCompatibility(file);
      let preflightChoice: UploadJob["preflightChoice"] = "auto";
      if (compatibility.level !== "supported") {
        if (!shouldAutoResolvePreflight(compatibility)) {
          const userChoice = await requestPreflightChoice(file, compatibility);
          if (userChoice === "cancel") {
            continue;
          }
          preflightChoice = userChoice === "normalize" ? "normalize" : "try_anyway";
        }
      }
      const metadata = await readVideoMetadata(file);
      queuedJobs.push({
        id: crypto.randomUUID(),
        file,
        fileName: file.name,
        fileSizeBytes: file.size,
        durationMs: metadata.durationMs,
        status: "queued",
        stageLabel: "Ready to analyze",
        progress: 0,
        createdAtIso: createdAt,
        compatibility,
        preflightChoice,
        drillSelection: createUploadJobDrillSelection({ selectedDrill })
      });
    }

    if (queuedJobs.length === 0) {
      return;
    }

    setUploadJobs((current) => [...current, ...queuedJobs]);
    setSelectedJobId((current) => current ?? queuedJobs[0]?.id ?? null);
  }, [requestPreflightChoice, selectedDrill]);

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
    if (preflightResolverRef.current) {
      preflightResolverRef.current("cancel");
      preflightResolverRef.current = null;
    }
    setPreflightPrompt(null);
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
  const hasRawPreview = Boolean(rawPreviewObjectUrl);
  const hasAnnotatedPreview = Boolean(annotatedPreviewObjectUrl);
  const uploadPreviewState = resolveUnifiedResultPreviewState({
    hasRaw: hasRawPreview,
    hasAnnotated: hasAnnotatedPreview,
    isProcessingAnnotated: hasActiveUpload,
    annotatedFailed: Boolean(annotatedFailureDetails) && hasCompletedResult,
    userRequestedRawDuringProcessing: showRawDuringProcessing,
    preferredCompletedSurface: completedPreviewSurface
  });
  const downloadTargets = resolveResultDownloadTargets({
    resultType: "upload",
    hasRawVideo: hasRawPreview,
    hasAnnotatedVideo: hasAnnotatedPreview,
    hasProcessingSummary: Boolean(activeJob?.artefacts?.processingSummary),
    hasPoseTimeline: Boolean(activeJob?.artefacts?.poseTimeline)
  });
  const previewSelection = selectPreviewSource({
    preferredId: uploadPreviewState === "showing_annotated_completed" ? "annotated" : "raw",
    sources: [
      ...(annotatedPreviewObjectUrl ? [{ id: "annotated" as const, url: annotatedPreviewObjectUrl, mimeType: activeJob?.artefacts?.annotatedVideoMimeType }] : []),
      ...(rawPreviewObjectUrl ? [{ id: "raw" as const, url: rawPreviewObjectUrl, mimeType: rawPreviewMimeType }] : [])
    ]
  });
  const preferredDeliverySource = selectPreferredDeliverySource([
    ...(activeJob?.artefacts?.annotatedVideoMimeType ? [{ id: "annotated" as const, url: annotatedPreviewObjectUrl ?? "", mimeType: activeJob.artefacts.annotatedVideoMimeType }] : []),
    ...(rawPreviewMimeType ? [{ id: "raw" as const, url: rawPreviewObjectUrl ?? "", mimeType: rawPreviewMimeType }] : [])
  ]);
  const downloadSafety = {
    annotated: activeJob?.artefacts?.annotatedVideoMimeType
      ? resolveSafeDelivery({ mimeType: activeJob.artefacts.annotatedVideoMimeType })
      : null,
    raw: rawPreviewMimeType ? resolveSafeDelivery({ mimeType: rawPreviewMimeType }) : null
  };
  const annotatedDownloadLabel = resolveUploadDownloadLabel({ kind: "annotated", downloadable: downloadSafety.annotated?.downloadable });
  const rawDownloadLabel = resolveUploadDownloadLabel({ kind: "raw", downloadable: downloadSafety.raw?.downloadable });
  const shouldCollapseReferencePanel = hasActiveUpload || hasCompletedResult;
  const showReferencePanel = isReferencePanelVisible;
  const queueHasMultiple = uploadJobs.length > 1;
  const previewUrl = previewSelection.source?.url ?? null;
  const replayAnalysisState = useMemo(
    () => buildReplayAnalysisState({
      session: activeSession,
      phaseLabelsById: activePhaseLabels,
      timestampMs: replayTimestampMs
    }),
    [activePhaseLabels, activeSession, replayTimestampMs]
  );
  const benchmarkFeedback = useMemo(
    () => activeSession?.benchmarkComparison ? buildBenchmarkCoachingFeedback({ comparison: activeSession.benchmarkComparison }) : null,
    [activeSession?.benchmarkComparison]
  );
  const compareStatusView = useMemo(
    () => deriveComparisonStatusView({ analysisSession: activeSession, benchmarkFeedback }),
    [activeSession, benchmarkFeedback]
  );
  const coachingFeedback = useMemo(
    () => {
      if (!activeSession || activeSession.status !== "completed") {
        return null;
      }
      return buildVisualCoachingFeedback({
        session: activeSession,
        benchmarkFeedback,
        drill: activeJob?.drillSelection.drill,
        replayState: replayAnalysisState,
        frame: getNearestPoseFrame(activeJob?.artefacts?.poseTimeline.frames ?? [], replayTimestampMs),
        timestampMs: replayTimestampMs
      });
    },
    [activeJob?.artefacts?.poseTimeline.frames, activeJob?.drillSelection.drill, activeSession, benchmarkFeedback, replayAnalysisState, replayTimestampMs]
  );
  const canOpenCompare = Boolean(
    activeSession
      && activeJob?.drillSelection.drill
      && (
        (activeJob.drillSelection.drill.benchmark && activeJob.drillSelection.drill.benchmark.sourceType !== "none")
        || activeSession.benchmarkComparison
      )
  );

  useEffect(() => {
    setReplayTimestampMs(0);
  }, [activeJob?.id, previewUrl, completedPreviewSurface]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video) {
      return;
    }
    const updateTimestamp = () => {
      setReplayTimestampMs(Math.max(0, Math.round(video.currentTime * 1000)));
    };
    video.addEventListener("timeupdate", updateTimestamp);
    video.addEventListener("seeking", updateTimestamp);
    video.addEventListener("seeked", updateTimestamp);
    video.addEventListener("loadedmetadata", updateTimestamp);
    return () => {
      video.removeEventListener("timeupdate", updateTimestamp);
      video.removeEventListener("seeking", updateTimestamp);
      video.removeEventListener("seeked", updateTimestamp);
      video.removeEventListener("loadedmetadata", updateTimestamp);
    };
  }, [previewUrl]);

  const uploadViewerModel = useMemo(
    () => {
      const replayState = resolveUploadReplayState(activeJob, uploadPreviewState);
      const replayLabelBase = getReplayStateMessage(replayState);
      const replayStatusLabel = replayState === "export-in-progress" && activeJob?.stageLabel
        ? `${replayLabelBase} · ${activeJob.stageLabel}`
        : replayLabelBase;
      return mapUploadAnalysisToViewerModel({
        previewState: uploadPreviewState,
        videoUrl: previewUrl,
        canShowVideo: Boolean(previewUrl),
        surface: completedPreviewSurface,
        hasRaw: hasRawPreview,
        hasAnnotated: hasAnnotatedPreview,
        session: activeSession,
        processingStageLabel: activeJob?.stageLabel ?? null,
        replayStateLabel: replayStatusLabel,
        replayTone: getReplayStateTone(replayState),
        durationMs: activeSession?.summary.analyzedDurationMs ?? activeJob?.durationMs,
        mediaAspectRatio:
          activeJob?.artefacts?.poseTimeline.video.width && activeJob.artefacts.poseTimeline.video.height
            ? activeJob.artefacts.poseTimeline.video.width / activeJob.artefacts.poseTimeline.video.height
            : undefined,
        panel: buildAnalysisPanelModel(buildAnalysisDomainModel({
          drillLabel: activeJob?.drillSelection.drillBinding.drillName || "Upload Video",
          movementType:
            (activeJob?.drillSelection.mode ?? "drill") === "drill"
              ? activeJob?.drillSelection.drill?.drillType === "hold"
                ? "hold"
                : "rep"
              : "freestyle",
          repCount: replayAnalysisState.repCount,
          holdDurationMs: replayAnalysisState.currentHoldMsAtPlayhead > 0
            ? replayAnalysisState.currentHoldMsAtPlayhead
            : replayAnalysisState.detectedHoldMs,
          durationMs: activeSession?.summary.analyzedDurationMs ?? activeJob?.durationMs,
          confidence: activeSession?.summary.confidenceAvg,
          events: activeSession?.events ?? [],
          phaseLabelsById: activePhaseLabels,
          phaseIdsInOrder: activeJob?.drillSelection.drill?.phases.map((phase) => phase.phaseId) ?? [],
          mode: "timestamp",
          currentTimestampMs: replayTimestampMs,
          feedbackLines:
            activeSession && activeSession.status === "completed"
              ? benchmarkFeedback
                ? [benchmarkFeedback.summary.label, benchmarkFeedback.topFindings[0]?.description ?? benchmarkFeedback.summary.description]
                : [
                    `Tracking confidence is ${Math.round((activeSession.summary.confidenceAvg ?? 0) * 100)}%.`,
                    "Coach notes not available yet"
                  ]
              : undefined,
          summaryMetrics: activeSession?.benchmarkComparison
            ? [
                { id: "benchmark_status", label: "Benchmark", value: benchmarkFeedback?.summary.label ?? activeSession.benchmarkComparison.status },
                {
                  id: "phase_match",
                  label: "Phase sequence",
                  value: isFullOrderedPhaseMatch(activeSession.benchmarkComparison.phaseMatch)
                    ? "Phase sequence matched."
                    : formatPhaseSequenceSummary(activeSession.benchmarkComparison)
                },
                {
                  id: "timing_match",
                  label: "Timing",
                  value: activeSession.benchmarkComparison.timing.present
                    ? (activeSession.benchmarkComparison.timing.matched ? "Timing matched." : "Timing mismatch.")
                    : "Unavailable"
                },
                {
                  id: "duration",
                  label: "Expected vs actual",
                  value: activeSession.benchmarkComparison.movementType === "rep"
                    ? `${formatDuration(activeSession.benchmarkComparison.timing.expectedRepDurationMs)} / ${formatDuration(activeSession.benchmarkComparison.timing.actualRepDurationMs)}`
                    : `${formatDuration(activeSession.benchmarkComparison.timing.expectedHoldDurationMs)} / ${formatDuration(activeSession.benchmarkComparison.timing.actualHoldDurationMs)}`
                }
              ]
            : undefined,
          benchmarkFeedback: benchmarkFeedback
            ? {
                summaryLabel: benchmarkFeedback.summary.label,
                summaryDescription: benchmarkFeedback.summary.description,
                severity: benchmarkFeedback.summary.severity,
                findings: benchmarkFeedback.topFindings.map((finding, index) => ({
                  id: `${finding.category}_${index}`,
                  title: finding.title,
                  description: finding.description,
                  severity: finding.severity
                })),
                nextSteps: benchmarkFeedback.nextSteps
              }
            : undefined,
          coachingFeedback: activeSession?.status === "completed" ? coachingFeedback ?? undefined : undefined,
          phaseTimelineInteractive: true
        })),
        primarySummaryChips:
          activeJob?.artefacts && activeSession && (activeJob.drillSelection.mode ?? "drill") === "drill"
            ? [
                { id: "drill", label: "Drill", value: activeJob.drillSelection.drillBinding.drillName || "Selected drill" },
                {
                  id: "phase",
                  label: "Current phase",
                  value: replayAnalysisState.currentPhaseLabel
                },
                ...(activeJob.drillSelection.drill?.drillType === "hold"
                  ? []
                  : [{ id: "reps", label: "Completed reps so far", value: String(replayAnalysisState.repCount) }]),
                ...(activeJob.drillSelection.drill?.drillType === "hold"
                  ? [
                      {
                        id: "hold_current",
                        label: "Current hold",
                        value: replayAnalysisState.currentHoldMsAtPlayhead > 0 ? formatDuration(replayAnalysisState.currentHoldMsAtPlayhead) : "Not active"
                      },
                      {
                        id: "hold_best",
                        label: "Best hold",
                        value: replayAnalysisState.maxHoldMs > 0 ? formatDuration(replayAnalysisState.maxHoldMs) : "None"
                      },
                      {
                        id: "hold_total",
                        label: "Total hold time",
                        value: replayAnalysisState.detectedHoldMs > 0 ? formatDuration(replayAnalysisState.detectedHoldMs) : "0s"
                      },
                      {
                        id: "hold_count",
                        label: "Completed holds",
                        value: String(replayAnalysisState.holdCount)
                      }
                    ]
                  : [{
                      id: "hold",
                      label: "Current hold",
                      value: replayAnalysisState.currentHoldMsAtPlayhead > 0 ? formatDuration(replayAnalysisState.currentHoldMsAtPlayhead) : "Not active"
                    }]),
                ...(activeJob.drillSelection.drill?.drillType === "hold"
                  ? []
                  : [{ id: "current_rep", label: "Current rep", value: String(replayAnalysisState.repIndex) }]),
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
                { id: "confidence", label: "Confidence", value: `${Math.round((activeSession.summary.confidenceAvg ?? 0) * 100)}%` },
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
            ? [{ id: "download_raw", label: rawDownloadLabel, onDownload: () => downloadBlob(activeJob.artefacts?.analysisVideoFile ?? activeJob.file, rawPreviewFileName ?? activeJob.fileName), hint: downloadSafety.raw?.warning ?? undefined }]
            : []),
          ...(downloadTargets.includes("processing_summary") && activeJob?.artefacts
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
                ...(downloadTargets.includes("pose_timeline") ? [{
                  id: "pose_timeline",
                  label: "Download Pose Timeline (.json)",
                  onDownload: () =>
                    downloadBlob(
                      new Blob([JSON.stringify(activeJob.artefacts?.poseTimeline, null, 2)], { type: "application/json" }),
                      `${createArtifactBaseName(activeJob.fileName)}.pose-timeline.json`
                    )
                }] : [])
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
                { id: "trace", title: "Temporal trace", content: traceRows.slice(0, 24).map((row) => `${formatDurationShort(row.timestampMs)} • phase=${row.phase} • reps=${row.repCount}`) },
                {
                  id: "source",
                  title: "Analysis source",
                  content: [
                    `Source: ${activeJob?.artefacts?.analysisSourceKind === "normalized" ? "Normalized fallback timeline" : "Raw upload timeline"}`,
                    `Preview: ${uploadPreviewState.includes("showing_raw") ? "Raw" : "Annotated"}`
                  ]
                }
              ]
            : [],
        warnings: [previewSelection.warning, downloadSafety.annotated?.warning, downloadSafety.raw?.warning, activeJob?.artefacts?.analysisSourceKind === "normalized" ? "Raw = normalized analysis source" : null].filter((value): value is string => Boolean(value)),
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
      });
    },
    [
      uploadPreviewState,
      previewUrl,
      completedPreviewSurface,
      replayTimestampMs,
      replayAnalysisState,
      activeSession,
      benchmarkFeedback,
      coachingFeedback,
      activeJob,
      activePhaseLabels,
      downloadTargets,
      annotatedDownloadLabel,
      downloadSafety.annotated?.warning,
      rawDownloadLabel,
      downloadSafety.raw?.warning,
      rawPreviewFileName,
      traceRows,
      previewSelection.warning,
      preferredDeliverySource,
      hasRawPreview,
      hasAnnotatedPreview
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

  const uploadReviewModel = useMemo(
    () => buildAnalysisReviewModel(uploadViewerModel, "upload"),
    [uploadViewerModel]
  );

  useEffect(() => {
    const canSave = Boolean(activeJob && activeSession && activeSession.status === "completed" && activeJob.status === "completed");
    if (!canSave || !activeJob) {
      return;
    }
    if (savedAttemptJobIdsRef.current.has(activeJob.id)) {
      return;
    }
    savedAttemptJobIdsRef.current.add(activeJob.id);

    const attempt = buildSavedAttemptSummary({
      review: uploadReviewModel,
      source: "upload",
      drillId: activeJob.drillSelection.drillBinding.drillId,
      drillVersion: activeJob.drillSelection.drillBinding.drillVersion,
      createdAt: activeJob.completedAtIso ?? new Date().toISOString()
    });

    void getBrowserAttemptHistoryRepository().saveAttempt(attempt)
      .then(() => setAttemptSaveState("saved"))
      .catch(() => {
        setAttemptSaveState("error");
        savedAttemptJobIdsRef.current.delete(activeJob.id);
      });
  }, [activeJob, activeSession, uploadReviewModel]);

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
                  : "Pick a drill, verify capture setup, then upload to analyze."
              }
              showReferencePanel={showReferencePanel}
              onToggleReferencePanel={() => setIsReferencePanelVisible((current) => !current)}
              actions={
                <button type="button" onClick={openFileChooser} style={{ padding: "0.45rem 0.75rem", fontSize: "0.86rem" }}>
                  Choose video
                </button>
              }
            />
            <CaptureSetupGuidance
              mode="upload"
              cameraViewLabel={selectedDrill?.drill ? formatExpectedViewLabel(selectedDrill.drill.primaryView) : null}
              drillTypeLabel={selectedDrill?.drill ? (selectedDrill.drill.drillType === "rep" ? "Rep" : "Hold") : null}
            />
            <div className="card upload-workflow-action-card" style={{ margin: 0 }}>
            <div style={{ display: "grid", gap: "0.65rem" }}>
              <div className="drill-selector-stack">
                <DrillOriginSelectField
                  selectedSource={selectedSource}
                  onSelectedSourceChange={setSelectedSource}
                  disabled={drillOptionsLoading}
                  labelClassName="live-streaming-control-field muted"
                  inputClassName="live-streaming-control-input"
                />
                <DrillComboboxField
                  selectedSource={selectedSource}
                  selectedDrillKey={selectedDrillKey}
                  onSelectedDrillKeyChange={setSelectedDrillKey}
                  drillOptionsBySource={drillOptionGroups}
                  fallbackKey={FREESTYLE_DRILL_KEY}
                  freestyleLabel="No drill · Freestyle overlay"
                  disabled={drillOptionsLoading}
                  labelClassName="live-streaming-control-field muted"
                  inputClassName="live-streaming-control-input"
                  helperClassName="muted"
                />
                <label className="live-streaming-control-field muted" style={{ fontSize: "0.85rem" }}>
                  <span>Cadence FPS</span>
                  <input
                    className="live-streaming-control-input"
                    type="number"
                    min={4}
                    max={30}
                    value={cadenceFps}
                    onChange={(event) => setCadenceFps(Math.max(4, Math.min(30, Number(event.target.value) || DEFAULT_CADENCE_FPS)))}
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
                Freestyle mode gives overlay-only analysis. Select a drill when you want drill-aware rep, hold, and phase metrics.
              </p>
              <p className="muted" style={{ margin: 0, fontSize: "0.84rem" }}>
                Recommended: MP4 (H.264/AVC, AAC or no audio, 24/30/60 fps). Apple/Android camera videos using HEVC, HDR, or high-FPS capture may need normalization first.
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
            benchmarkState={selectedDrill?.benchmarkState}
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
                  <p className="muted" style={{ margin: "0.16rem 0 0", fontSize: "0.77rem" }}>
                    Compatibility: {job.compatibility?.level ?? "unknown"}
                    {job.preflightChoice === "normalize"
                      ? " · normalize first"
                      : job.preflightChoice === "try_anyway"
                        ? " · try anyway"
                        : " · default processing"}
                  </p>
                  <p
                    style={{
                      margin: "0.16rem 0 0",
                      fontSize: "0.8rem",
                      color: job.status === "completed" ? "#8ce7bf" : job.status === "processing" ? "#f7d58b" : "var(--text-muted)"
                    }}
                  >
                    {job.stageLabel}
                    {job.status === "processing" && parseFrameProgress(job.stageLabel) ? " (in progress)" : ""}
                  </p>
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

      {preflightPrompt ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(4,8,14,0.72)",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
            padding: "1rem"
          }}
        >
          <article className="card" style={{ width: "min(620px, 96vw)", margin: 0, display: "grid", gap: "0.75rem" }}>
            <h3 style={{ margin: 0 }}>
              {preflightPrompt.report.level === "unsupported" ? "This file type is not officially supported." : "This upload may not analyze reliably."}
            </h3>
            <p className="muted" style={{ margin: 0 }}>
              {preflightPrompt.file.name}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              CaliVision officially supports MP4 with H.264/AVC video and common browser-friendly 8-bit camera formats.
            </p>
            {preflightPrompt.report.reasons.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {preflightPrompt.report.reasons.map((reason) => (
                  <li key={reason} className="muted">{formatCompatibilityReason(reason)}</li>
                ))}
              </ul>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.45rem", flexWrap: "wrap" }}>
              <button type="button" className="pill" onClick={() => resolvePreflightChoice("cancel")}>Cancel</button>
              <button type="button" className="pill" onClick={() => resolvePreflightChoice("try_anyway")}>Try anyway</button>
              <button type="button" onClick={() => resolvePreflightChoice("normalize")}>Normalize automatically</button>
            </div>
          </article>
        </div>
      ) : null}

          {activeJob ? (
            <section className="card" style={{ margin: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: 0 }}>Analysis result</h3>
                  {attemptSaveState === "saved" ? <p className="muted" style={{ margin: "0.2rem 0 0" }}>Attempt saved to history.</p> : null}
                  {attemptSaveState === "error" ? <p className="muted" style={{ margin: "0.2rem 0 0" }}>Attempt could not be saved to history.</p> : null}
                </div>
              </div>
              {canOpenCompare ? (
                <article className="card" style={{ margin: "0 0 0.75rem", border: "1px solid #334155", display: "grid", gap: "0.45rem" }}>
                  <h4 style={{ margin: 0 }}>Benchmark comparison</h4>
                  <p className="muted" style={{ margin: 0 }}>
                    Compare this attempt against the benchmark pose, timing, and drill expectations.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "0.45rem" }}>
                    <span className="muted"><strong>Status:</strong> {compareStatusView.label}</span>
                    <span className="muted"><strong>Confidence:</strong> {activeSession?.summary.confidenceAvg !== undefined ? `${Math.round(activeSession.summary.confidenceAvg * 100)}%` : "—"}</span>
                    <span className="muted"><strong>Target:</strong> {compareStatusView.timingLabel}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => {
                        const drill = activeJob.drillSelection.drill;
                        if (!drill || !activeSession) {
                          return;
                        }
                        writeCompareHandoffPayload({
                          source: "upload",
                          fromPath: "/upload",
                          drill,
                          analysisSession: activeSession,
                          benchmarkFeedback,
                          coachingFeedback,
                          attemptVideoUrl: previewUrl ?? undefined,
                          benchmarkVideoUrl: drill.benchmark?.media?.referenceVideoUri,
                          benchmarkPoses: drill.benchmark?.phaseSequence?.map((phase) => phase.pose).filter((pose): pose is NonNullable<typeof pose> => Boolean(pose)),
                          attemptPoseFrames: activeJob.artefacts?.poseTimeline.frames ?? []
                        });
                        router.push("/compare");
                      }}
                    >
                      Review benchmark comparison
                    </button>
                  </div>
                </article>
              ) : null}
              <div ref={fullscreenContainerRef}>
                <AnalysisViewerShell
                  model={{ ...uploadViewerModel, progress: uploadPreviewState === "processing_annotated" ? activeJob.progress : undefined }}
                  videoRef={previewVideoRef}
                  reviewSource="upload"
                  overlayCanvas={(uploadPreviewState === "showing_raw_completed" || uploadPreviewState === "showing_raw_during_processing" || uploadPreviewState === "annotated_failed_showing_raw") ? <canvas ref={previewCanvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} /> : undefined}
                  onSurfaceChange={(surface) => {
                    setCompletedPreviewSurface(surface);
                    if (hasActiveUpload) {
                      setShowRawDuringProcessing(surface === "raw");
                    }
                  }}
                  onPhaseTimelineSelect={(segment) => {
                    setReplayTimestampMs(segment.seekTimestampMs);
                    seekVideoToTimestamp(previewVideoRef.current, segment.seekTimestampMs);
                  }}
                />
              </div>
            </section>
      ) : null}
    </section>
  );
}

