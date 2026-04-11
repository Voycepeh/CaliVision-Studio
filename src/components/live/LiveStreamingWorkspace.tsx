"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { createOverlayProjection, isPreviewSurfaceReady, resolveOverlayCanvasSize, type OverlayProjection } from "@/lib/live/overlay-geometry";
import { DRILL_SOURCE_ORDER, formatDrillSourceLabel, type DrillSourceKind } from "@/lib/drill-source";
import type { CanonicalJointName } from "@/lib/schema/contracts";
import { DrillSetupHeader } from "@/components/workflow-setup/DrillSetupHeader";
import { DrillSetupShell } from "@/components/workflow-setup/DrillSetupShell";
import { ReferenceAnimationPanel } from "@/components/workflow-setup/ReferenceAnimationPanel";
import { buildPhaseRuntimeModel } from "@/lib/analysis";
import { formatCameraViewLabel, resolveDrillCameraViewWithDiagnostics } from "@/lib/analysis";
import { createPoseLandmarkerForJob, mapLandmarksToPoseFrame } from "@/lib/workflow/pose-landmarker";
import { drawAnalysisOverlay, drawPoseOverlay } from "@/lib/workflow/pose-overlay";
import { resolveAvailableDownloads, type PreviewSurface } from "@/lib/results/preview-state";
import { canLikelyPlayMimeType, extensionFromMimeType, resolveSafeDelivery, selectPreferredDeliverySource, selectPreviewSource } from "@/lib/media/media-capabilities";
import { resolveLiveDownloadLabel } from "@/lib/media/download-labels";
import { mapLiveAnalysisToViewerModel } from "@/lib/analysis-viewer/adapters";
import { seekVideoToTimestamp } from "@/lib/analysis-viewer/behavior";
import {
  APP_HARDWARE_ZOOM_PRESETS,
  applyHardwareZoomPreset,
  buildLiveResultsSummary,
  classifyCameraError,
  createLiveTraceAccumulator,
  createMediaRecorder,
  exportAnnotatedReplayFromLiveTrace,
  formatHardwareZoomLabel,
  getCameraSupportStatus,
  getHardwareZoomSupport,
  getSupportedZoomPresets,
  mapLiveTraceToTimelineMarkers,
  resolveSelectedZoomPreset,
  stopMediaStream,
  summarizeLiveTraceFreshness,
  type LiveDrillSelection,
  type LiveSessionStatus,
  type LiveSessionTrace,
  type ReplayTerminalState
} from "@/lib/live";
import { buildAnalysisSessionFromLiveTrace } from "@/lib/live/session-compositor";
import { clearActiveDrillContext, setActiveDrillContext } from "@/lib/workflow/drill-context";
import { useAvailableDrills } from "@/lib/workflow/use-available-drills";
import { AnalysisViewerShell } from "@/components/analysis-viewer/AnalysisViewerShell";

const LIVE_ANALYSIS_CADENCE_FPS = 10;
const LIVE_OVERLAY_PRESENTATION_FPS = 30;
const LIVE_ANALYSIS_INTERVAL_MS = Math.round(1000 / LIVE_ANALYSIS_CADENCE_FPS);
const LIVE_PRESENTATION_INTERVAL_MS = Math.round(1000 / LIVE_OVERLAY_PRESENTATION_FPS);
const FREESTYLE_KEY = "freestyle";
const LANDMARK_SMOOTHING_ALPHA = 0.38;
const JOINT_VISIBILITY_ENTER_THRESHOLD = 0.52;
const JOINT_VISIBILITY_EXIT_THRESHOLD = 0.42;
const JOINT_VISIBILITY_GRACE_SAMPLES = 2;
const LIVE_POSE_STALE_HOLD_MS = 420;
const LIVE_POSE_STALE_WARNING_MS = 1_200;
const LIVE_DIAGNOSTIC_LOG_INTERVAL_MS = 1_500;
const LIVE_MIN_TRACE_TIMESTAMP_STEP_MS = 4;
const LIVE_SELECTED_DRILL_STORAGE_KEY = "live.selected-drill";
const LIVE_HUD_UPDATE_INTERVAL_MS = 250;
const FULL_BODY_REQUIRED_JOINTS: CanonicalJointName[] = [
  "leftShoulder",
  "rightShoulder",
  "leftHip",
  "rightHip",
  "leftKnee",
  "rightKnee",
  "leftAnkle",
  "rightAnkle"
];

type LiveCadenceStats = {
  renderFrames: number;
  analysisTicks: number;
  detectionInvocations: number;
  detectionSuccesses: number;
  landmarkUpdates: number;
  presentationTicks: number;
  stalePoseReuseCount: number;
};

type LiveHardwareZoomState =
  | { supported: false; value: 1 }
  | { supported: true; value: number; min: number; max: number; step: number; presets: number[] };

async function readRecordedVideoMetadata(blob: Blob): Promise<{ durationMs: number; width: number; height: number }> {
  const objectUrl = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = objectUrl;

  const metadata = await new Promise<{ durationMs: number; width: number; height: number }>((resolve, reject) => {
    video.onloadedmetadata = () => {
      resolve({
        durationMs: Math.max(0, Math.round(video.duration * 1000)),
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720
      });
    };
    video.onerror = () => reject(new Error("Unable to load recorded video metadata."));
  });

  URL.revokeObjectURL(objectUrl);
  return metadata;
}

function buildPhaseLabelMap(drill?: NonNullable<LiveDrillSelection["drill"]>): Record<string, string> {
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

function triggerDownload(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


export function LiveStreamingWorkspace() {
  const searchParams = useSearchParams();
  const { session, isConfigured } = useAuth();
  const [status, setStatus] = useState<LiveSessionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReferencePanelVisible, setIsReferencePanelVisible] = useState(true);
  const [isRearCamera, setIsRearCamera] = useState(true);
  const [liveTrace, setLiveTrace] = useState<LiveSessionTrace | null>(null);
  const [rawReplayUrl, setRawReplayUrl] = useState<string | null>(null);
  const [rawReplayBlob, setRawReplayBlob] = useState<Blob | null>(null);
  const [rawReplayMimeType, setRawReplayMimeType] = useState<string | null>(null);
  const [annotatedReplayUrl, setAnnotatedReplayUrl] = useState<string | null>(null);
  const [annotatedReplayBlob, setAnnotatedReplayBlob] = useState<Blob | null>(null);
  const [annotatedReplayMimeType, setAnnotatedReplayMimeType] = useState<string | null>(null);
  const [replayState, setReplayState] = useState<ReplayTerminalState>("idle");
  const [replayExportStageLabel, setReplayExportStageLabel] = useState<string | null>(null);
  const [showRawDuringProcessing, setShowRawDuringProcessing] = useState(false);
  const [completedPreviewSurface, setCompletedPreviewSurface] = useState<PreviewSurface>("raw");
  const [annotatedReplayFailureMessage, setAnnotatedReplayFailureMessage] = useState<string | null>(null);
  const [annotatedReplayFailureDetails, setAnnotatedReplayFailureDetails] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [framingWarning, setFramingWarning] = useState<string | null>(null);
  const [previewAspectRatio, setPreviewAspectRatio] = useState<number>(16 / 9);
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);
  const [isFullscreenSupported, setIsFullscreenSupported] = useState(false);
  const [liveHardwareZoom, setLiveHardwareZoom] = useState<LiveHardwareZoomState>({ supported: false, value: 1 });
  const requestedDrillKey = searchParams.get("drillKey");
  const { drillOptions, drillOptionGroups, selectedDrillKey: selectedKey, setSelectedDrillKey: setSelectedKey, selectedSource, setSelectedSource } =
    useAvailableDrills({
      session,
      isConfigured,
      requestedDrillKey,
      storageKey: LIVE_SELECTED_DRILL_STORAGE_KEY,
      fallbackKey: FREESTYLE_KEY,
      defaultSource: "local"
    });
  const trackingStatusRef = useRef<string>("Tracking ready");
  const framingWarningRef = useRef<string | null>(null);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const replayVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaContainerRef = useRef<HTMLDivElement | null>(null);
  const sessionStageRef = useRef<HTMLDivElement | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const traceRef = useRef<ReturnType<typeof createLiveTraceAccumulator> | null>(null);
  const liveLoopRef = useRef<number | null>(null);
  const recorderRef = useRef<ReturnType<typeof createMediaRecorder> | null>(null);
  const rawReplayUrlRef = useRef<string | null>(null);
  const annotatedReplayUrlRef = useRef<string | null>(null);
  const landmarkerRef = useRef<Awaited<ReturnType<typeof createPoseLandmarkerForJob>> | null>(null);
  const startedAtRef = useRef<number>(0);
  const mediaStartMsRef = useRef<number>(0);
  const smoothedFrameRef = useRef<ReturnType<typeof mapLandmarksToPoseFrame> | null>(null);
  const jointVisibleRef = useRef<Record<string, boolean>>({});
  const jointGraceSamplesRef = useRef<Record<string, number>>({});
  const overlayNeedsResizeSyncRef = useRef(true);
  const overlayPixelRatioRef = useRef(1);
  const overlayProjectionRef = useRef<OverlayProjection | null>(null);
  const lastOverlayDiagnosticsAtRef = useRef(0);
  const lastPoseFrameAtRef = useRef<number>(0);
  const lastAcceptedLandmarkTimestampRef = useRef<number>(0);
  const lastAcceptedLandmarkPerfNowRef = useRef<number>(0);
  const lastRenderedLandmarkTimestampRef = useRef<number>(0);
  const lastDetectionTimestampRef = useRef<number>(0);
  const lastVideoTimeMsRef = useRef<number>(0);
  const repeatedVideoTimestampCountRef = useRef<number>(0);
  const lastDiagnosticLogAtRef = useRef<number>(0);
  const lastTrackingHudUpdateAtRef = useRef<number>(0);
  const lastFramingHudUpdateAtRef = useRef<number>(0);
  const stalePoseLoggedRef = useRef(false);
  const containerSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const selectedZoomRef = useRef<number>(1);
  const activeVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const liveCadenceStatsRef = useRef<LiveCadenceStats>({
    renderFrames: 0,
    analysisTicks: 0,
    detectionInvocations: 0,
    detectionSuccesses: 0,
    landmarkUpdates: 0,
    presentationTicks: 0,
    stalePoseReuseCount: 0
  });

  const selectedDrill = useMemo(
    () => (selectedKey === FREESTYLE_KEY ? null : drillOptions.find((option) => option.key === selectedKey) ?? null),
    [drillOptions, selectedKey]
  );
  const visibleDrillOptions = useMemo(() => drillOptionGroups.get(selectedSource) ?? [], [drillOptionGroups, selectedSource]);

  const selection: LiveDrillSelection = useMemo(() => {
    if (!selectedDrill) {
      return {
        mode: "freestyle",
        drillBindingLabel: "No drill · Freestyle",
        drillBindingSource: "freestyle"
      };
    }

    const resolvedCameraView = resolveDrillCameraViewWithDiagnostics(selectedDrill.drill);
    if (resolvedCameraView.diagnostics.warning && process.env.NODE_ENV !== "production") {
      console.warn("[live-analysis] DRILL_CAMERA_VIEW_FALLBACK", {
        warning: resolvedCameraView.diagnostics.warning,
        drillId: selectedDrill.drill.drillId,
        drillTitle: selectedDrill.drill.title
      });
    }

    return {
      mode: "drill",
      drill: selectedDrill.drill,
      drillVersion: selectedDrill.packageVersion,
      cameraView: resolvedCameraView.cameraView,
      drillBindingLabel: selectedDrill.drill.title,
      drillBindingSource: selectedDrill.sourceKind,
      sourceId: selectedDrill.sourceId
    };
  }, [selectedDrill]);
  const phaseLabelMap = useMemo(() => buildPhaseLabelMap(selection.drill), [selection.drill]);
  const requiredFramingJoints = useMemo(() => {
    if (!selection.drill?.phases.length) {
      return [];
    }
    const unique = new Set<CanonicalJointName>();
    for (const phase of selection.drill.phases) {
      for (const joint of phase.analysis?.matchHints?.requiredJoints ?? []) {
        unique.add(joint);
      }
    }
    if (unique.size > 0) {
      return [...unique];
    }
    return selection.cameraView === "front" ? FULL_BODY_REQUIRED_JOINTS : [];
  }, [selection.cameraView, selection.drill]);

  const summary = useMemo(() => (liveTrace ? buildLiveResultsSummary(liveTrace) : null), [liveTrace]);
  const timelineMarkers = useMemo(() => (liveTrace ? mapLiveTraceToTimelineMarkers(liveTrace, phaseLabelMap) : []), [liveTrace, phaseLabelMap]);
  const replayDownloads = resolveAvailableDownloads({ hasRaw: Boolean(rawReplayUrl), hasAnnotated: Boolean(annotatedReplayUrl) });
  const activeReplaySurface: PreviewSurface = replayState === "export-in-progress" ? (showRawDuringProcessing ? "raw" : "annotated") : completedPreviewSurface;
  const activeReplaySource = activeReplaySurface === "annotated"
    ? (annotatedReplayUrl ? [{ id: "annotated" as const, url: annotatedReplayUrl, mimeType: annotatedReplayMimeType }] : [])
    : (rawReplayUrl ? [{ id: "raw" as const, url: rawReplayUrl, mimeType: rawReplayMimeType }] : []);
  const replayPreviewSelection = activeReplaySource.length > 0
    ? selectPreviewSource({
      preferredId: activeReplaySurface,
      sources: activeReplaySource
    })
    : { source: null, blockedByCompatibility: false, warning: null };
  const preferredReplayDeliverySource = selectPreferredDeliverySource([
    ...(annotatedReplayUrl ? [{ id: "annotated" as const, url: annotatedReplayUrl, mimeType: annotatedReplayMimeType }] : []),
    ...(rawReplayUrl ? [{ id: "raw" as const, url: rawReplayUrl, mimeType: rawReplayMimeType }] : [])
  ]);
  const replayDownloadSafety = {
    annotated: annotatedReplayMimeType ? resolveSafeDelivery({ mimeType: annotatedReplayMimeType }) : null,
    raw: rawReplayMimeType ? resolveSafeDelivery({ mimeType: rawReplayMimeType }) : null
  };
  const annotatedDownloadLabel = resolveLiveDownloadLabel({ kind: "annotated", downloadable: replayDownloadSafety.annotated?.downloadable });
  const rawDownloadLabel = resolveLiveDownloadLabel({ kind: "raw", downloadable: replayDownloadSafety.raw?.downloadable });
  const replayUrl = replayPreviewSelection.source?.url ?? null;
  const replayMimeType = replayPreviewSelection.source?.mimeType ?? null;
  const isSessionStageActive = status === "live-session-running" || status === "requesting-permission" || status === "stopping-finalizing";
  const shouldShowSessionToolbar = isSessionStageActive || isStageFullscreen;
  const activeZoomPreset = useMemo(
    () => (liveHardwareZoom.supported ? resolveSelectedZoomPreset(liveHardwareZoom.value, liveHardwareZoom.presets) : null),
    [liveHardwareZoom]
  );
  const replayUnavailableMessage = useMemo(() => {
    if (replayState === "export-in-progress") {
      return null;
    }
    if (replayPreviewSelection.warning) {
      return replayPreviewSelection.warning;
    }
    if (activeReplaySurface === "raw" && !rawReplayUrl) {
      return "Raw replay is unavailable for this live session.";
    }
    if (activeReplaySurface === "annotated" && !annotatedReplayUrl) {
      return "Annotated replay is unavailable for this live session.";
    }
    if (replayState === "export-failed") {
      return "Replay is unavailable for this session. Retake the drill and keep your full body in frame.";
    }
    if (!rawReplayUrl && !annotatedReplayUrl) {
      return "Replay is unavailable for this session. Retake and keep your camera stable.";
    }
    return null;
  }, [activeReplaySurface, annotatedReplayUrl, rawReplayUrl, replayPreviewSelection.warning, replayState]);
  const liveViewerModel = useMemo(
    () => {
      if (!liveTrace) {
        return null;
      }
      return mapLiveAnalysisToViewerModel({
        replayState,
        replayStageLabel: replayExportStageLabel,
        videoUrl: replayUrl,
        surface: completedPreviewSurface,
        selectedEventId: selectedMarkerId,
        durationMs: liveTrace.video.durationMs,
        hasAnnotatedReady: Boolean(annotatedReplayUrl),
        mediaAspectRatio:
          liveTrace && liveTrace.video.width > 0 && liveTrace.video.height > 0
            ? liveTrace.video.width / liveTrace.video.height
            : undefined,
        markers: timelineMarkers,
        primarySummaryChips: [
          { id: "drill", label: "Drill", value: summary?.drillLabel ?? "Freestyle" },
          { id: "duration", label: "Duration", value: summary?.durationLabel ?? "0s" },
          { id: "reps", label: "Reps", value: String(summary?.repCount ?? 0) },
          { id: "holds", label: "Holds", value: summary?.holdSummaryLabel ?? "No holds detected" },
          { id: "phases", label: "Phase result", value: summary?.phaseSummaryLabel ?? "No phase transitions detected" }
        ],
        technicalStatusChips: [
          {
            id: "tracking",
            label: "Tracking",
            value: trackingStatusRef.current,
            tone: trackingStatusRef.current === "Tracking active" ? "success" : trackingStatusRef.current === "Tracking lost" ? "warning" : "neutral"
          },
          ...(selection.cameraView ? [{ id: "camera", label: "Camera view", value: formatCameraViewLabel(selection.cameraView) }] : [])
        ],
        downloads: [
          ...(replayDownloads.includes("annotated") && annotatedReplayUrl
            ? [{
                id: "annotated",
                label: annotatedDownloadLabel,
                onDownload: () => triggerDownload(annotatedReplayUrl, `${liveTrace?.traceId ?? "live-session"}-annotated.${extensionFromMimeType(annotatedReplayMimeType)}`),
                hint: replayDownloadSafety.annotated?.warning ?? undefined
              }]
            : []),
          ...(replayDownloads.includes("raw") && rawReplayUrl
            ? [{
                id: "raw",
                label: rawDownloadLabel,
                onDownload: () => triggerDownload(rawReplayUrl, `${liveTrace?.traceId ?? "live-session"}-raw.${extensionFromMimeType(rawReplayMimeType)}`),
                hint: replayDownloadSafety.raw?.warning ?? undefined
              }]
            : [])
        ],
        diagnosticsSections: [
          ...(timelineMarkers.length > 0
            ? [{ id: "events", title: "Events", content: timelineMarkers.slice(0, 24).map((marker) => marker.label) }]
            : [])
        ],
        warnings: [annotatedReplayFailureMessage, annotatedReplayFailureDetails, replayPreviewSelection.warning, replayUnavailableMessage].filter(
          (value): value is string => Boolean(value)
        ),
        recommendedDeliveryLabel: preferredReplayDeliverySource
          ? `Recommended delivery: ${preferredReplayDeliverySource.id === "annotated" ? "Annotated" : "Raw"}`
          : undefined
      });
    },
    [
      liveTrace,
      replayState,
      replayExportStageLabel,
      replayUrl,
      completedPreviewSurface,
      selectedMarkerId,
      timelineMarkers,
      summary?.drillLabel,
      summary?.durationLabel,
      summary?.repCount,
      summary?.holdSummaryLabel,
      summary?.phaseSummaryLabel,
      selection.cameraView,
      replayDownloads,
      annotatedReplayUrl,
      liveTrace?.traceId,
      annotatedReplayMimeType,
      replayDownloadSafety.annotated?.warning,
      rawReplayUrl,
      rawReplayMimeType,
      replayDownloadSafety.raw?.warning,
      annotatedDownloadLabel,
      rawDownloadLabel,
      annotatedReplayFailureMessage,
      annotatedReplayFailureDetails,
      replayPreviewSelection.warning,
      replayUnavailableMessage,
      preferredReplayDeliverySource
    ]
  );

  useEffect(() => {
    if (timelineMarkers.length === 0) {
      setSelectedMarkerId(null);
      return;
    }
    setSelectedMarkerId((current) => (current && timelineMarkers.some((marker) => marker.id === current) ? current : timelineMarkers[0].id));
  }, [timelineMarkers]);

  useEffect(() => {
    if (!liveTrace) {
      return;
    }
    console.info("[live-overlay] PREVIEW_DELIVERY_SELECTION", {
      requestedSurface: activeReplaySurface,
      selectedSource: replayPreviewSelection.source?.id ?? "none",
      selectedMimeType: replayPreviewSelection.source?.mimeType ?? "unknown",
      appleFallbackTriggered: replayPreviewSelection.blockedByCompatibility,
      annotatedDownload: replayDownloadSafety.annotated?.downloadable ?? "n/a",
      rawDownload: replayDownloadSafety.raw?.downloadable ?? "n/a"
    });
    if (!replayPreviewSelection.source) {
      const reason =
        activeReplaySurface === "raw"
          ? !rawReplayUrl
            ? "missing_raw_video_url"
            : replayPreviewSelection.warning
              ? "raw_video_compatibility_blocked"
              : "raw_video_selection_missing"
          : !annotatedReplayUrl
            ? "missing_annotated_video_url"
            : replayPreviewSelection.warning
              ? "annotated_video_compatibility_blocked"
              : "annotated_video_selection_missing";
      console.error("[live-overlay] replay-source-unavailable", {
        reason,
        requestedSurface: activeReplaySurface,
        rawVideoUrlPresent: Boolean(rawReplayUrl),
        rawVideoBlobPresent: Boolean(rawReplayBlob),
        rawMimeType: rawReplayMimeType,
        annotatedVideoUrlPresent: Boolean(annotatedReplayUrl),
        annotatedVideoBlobPresent: Boolean(annotatedReplayBlob),
        annotatedMimeType: annotatedReplayMimeType
      });
    } else if (replayMimeType && !canLikelyPlayMimeType(replayMimeType)) {
      console.warn("[live-overlay] replay-source-mime-may-not-play", {
        requestedSurface: activeReplaySurface,
        mimeType: replayMimeType
      });
    }
  }, [activeReplaySurface, annotatedReplayBlob, annotatedReplayMimeType, annotatedReplayUrl, liveTrace, rawReplayBlob, rawReplayMimeType, rawReplayUrl, replayDownloadSafety.annotated?.downloadable, replayDownloadSafety.raw?.downloadable, replayMimeType, replayPreviewSelection.blockedByCompatibility, replayPreviewSelection.source, replayPreviewSelection.warning]);

  const updateTrackingStatus = useCallback((nextStatus: string) => {
    if (trackingStatusRef.current === nextStatus) {
      return;
    }
    trackingStatusRef.current = nextStatus;
  }, []);
  const updateFramingWarning = useCallback((nextWarning: string | null) => {
    if (framingWarningRef.current === nextWarning) {
      return;
    }
    framingWarningRef.current = nextWarning;
    setFramingWarning(nextWarning);
  }, []);

  useEffect(() => {
    overlayNeedsResizeSyncRef.current = true;
    console.debug("[live-overlay] remap-trigger", {
      reason: "camera-switch",
      facingMode: isRearCamera ? "rear" : "front"
    });
  }, [isRearCamera]);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (selectedKey === FREESTYLE_KEY) {
      clearActiveDrillContext();
      return;
    }
    const matching = drillOptions.find((option) => option.key === selectedKey);
    if (!matching?.sourceId) {
      return;
    }
    setActiveDrillContext({ drillId: matching.drill.drillId, sourceKind: matching.sourceKind, sourceId: matching.sourceId });
  }, [drillOptions, selectedKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (getCameraSupportStatus(window) === "unsupported") {
      setStatus("unsupported");
      setErrorMessage("Live Streaming is unsupported in this browser. Use a browser with camera + MediaRecorder support.");
    }
  }, [updateFramingWarning, updateTrackingStatus]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const supportsFullscreen = typeof document.documentElement.requestFullscreen === "function";
    setIsFullscreenSupported(supportsFullscreen);
    const handleFullscreenChange = () => {
      setIsStageFullscreen(Boolean(sessionStageRef.current && document.fullscreenElement === sessionStageRef.current));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const exitStageFullscreenIfNeeded = useCallback(async () => {
    if (typeof document === "undefined") {
      return;
    }
    if (document.fullscreenElement && document.fullscreenElement === sessionStageRef.current) {
      await document.exitFullscreen?.();
    }
  }, []);

  const cleanupSession = useCallback(async (options?: { stopRecorder?: boolean; discardRecording?: boolean; nextStatus?: LiveSessionStatus }) => {
    if (liveLoopRef.current) {
      cancelAnimationFrame(liveLoopRef.current);
      liveLoopRef.current = null;
    }
    await exitStageFullscreenIfNeeded();
    if (options?.stopRecorder && recorderRef.current) {
      await recorderRef.current.stop({ discard: options.discardRecording ?? true });
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    await stopMediaStream(liveStreamRef.current);
    liveStreamRef.current = null;
    activeVideoTrackRef.current = null;
    landmarkerRef.current?.close?.();
    landmarkerRef.current = null;
    recorderRef.current = null;
    traceRef.current = null;
    smoothedFrameRef.current = null;
    lastPoseFrameAtRef.current = 0;
    lastAcceptedLandmarkTimestampRef.current = 0;
    lastAcceptedLandmarkPerfNowRef.current = 0;
    lastRenderedLandmarkTimestampRef.current = 0;
    lastDetectionTimestampRef.current = 0;
    lastVideoTimeMsRef.current = 0;
    repeatedVideoTimestampCountRef.current = 0;
    lastDiagnosticLogAtRef.current = 0;
    lastTrackingHudUpdateAtRef.current = 0;
    lastFramingHudUpdateAtRef.current = 0;
    stalePoseLoggedRef.current = false;
    liveCadenceStatsRef.current = {
      renderFrames: 0,
      analysisTicks: 0,
      detectionInvocations: 0,
      detectionSuccesses: 0,
      landmarkUpdates: 0,
      presentationTicks: 0,
      stalePoseReuseCount: 0
    };
    jointVisibleRef.current = {};
    jointGraceSamplesRef.current = {};
    const canvas = previewCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    if (options?.nextStatus) {
      setStatus(options.nextStatus);
    }
    updateTrackingStatus("Tracking ready");
    updateFramingWarning(null);
  }, [exitStageFullscreenIfNeeded, updateFramingWarning, updateTrackingStatus]);

  const syncOverlayCanvasSize = useCallback((force = false) => {
    if (!force && !overlayNeedsResizeSyncRef.current) {
      return;
    }
    const canvas = previewCanvasRef.current;
    const container = mediaContainerRef.current;
    if (!canvas || !container) return;

    const bounds =
      containerSizeRef.current.width > 0 && containerSizeRef.current.height > 0
        ? containerSizeRef.current
        : container.getBoundingClientRect();
    const resized = resolveOverlayCanvasSize({
      cssWidth: bounds.width,
      cssHeight: bounds.height,
      devicePixelRatio: typeof window === "undefined" ? 1 : window.devicePixelRatio
    });
    if (canvas.style.width !== `${resized.cssWidth}px`) {
      canvas.style.width = `${resized.cssWidth}px`;
    }
    if (canvas.style.height !== `${resized.cssHeight}px`) {
      canvas.style.height = `${resized.cssHeight}px`;
    }
    if (canvas.width !== resized.backingWidth || canvas.height !== resized.backingHeight) {
      canvas.width = resized.backingWidth;
      canvas.height = resized.backingHeight;
    }
    overlayPixelRatioRef.current = resized.pixelRatio;

    const video = previewVideoRef.current;
    if (video?.videoWidth && video.videoHeight) {
      overlayProjectionRef.current = createOverlayProjection({
        viewportWidth: resized.cssWidth,
        viewportHeight: resized.cssHeight,
        sourceWidth: video.videoWidth,
        sourceHeight: video.videoHeight,
        fitMode: "contain",
        mirrored: !isRearCamera
      });
    }
    overlayNeedsResizeSyncRef.current = false;
  }, [isRearCamera]);

  const logOverlayDiagnostics = useCallback(
    (reason: string) => {
      if (typeof window === "undefined" || !(window as typeof window & { __CALI_DEBUG_LIVE_OVERLAY?: boolean }).__CALI_DEBUG_LIVE_OVERLAY) {
        return;
      }
      const now = performance.now();
      if (now - lastOverlayDiagnosticsAtRef.current < 1200) return;
      lastOverlayDiagnosticsAtRef.current = now;
      const containerBounds = mediaContainerRef.current?.getBoundingClientRect();
      const video = previewVideoRef.current;
      const canvas = previewCanvasRef.current;
      console.debug("[live-overlay]", reason, {
        mirrored: !isRearCamera,
        video: video
          ? {
              readyState: video.readyState,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              currentTime: video.currentTime
            }
          : null,
        container: containerBounds
          ? {
              width: Math.round(containerBounds.width),
              height: Math.round(containerBounds.height)
            }
          : null,
        canvas: canvas
          ? {
              cssWidth: canvas.style.width || "100%",
              cssHeight: canvas.style.height || "100%",
              width: canvas.width,
              height: canvas.height
            }
          : null,
        projection: overlayProjectionRef.current
      });
    },
    [isRearCamera]
  );

  useEffect(() => {
    const container = mediaContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const initial = container.getBoundingClientRect();
    containerSizeRef.current = { width: initial.width, height: initial.height };

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect) {
        containerSizeRef.current = {
          width: entry.contentRect.width,
          height: entry.contentRect.height
        };
      }
      overlayNeedsResizeSyncRef.current = true;
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [syncOverlayCanvasSize]);

  useEffect(() => {
    const logRemap = (reason: string) => {
      console.debug("[live-overlay] remap-trigger", {
        reason,
        isPortrait: window.matchMedia("(orientation: portrait)").matches,
        fullscreen: Boolean(document.fullscreenElement),
        facingMode: isRearCamera ? "rear" : "front"
      });
    };
    const onWindowResize = () => {
      const bounds = mediaContainerRef.current?.getBoundingClientRect();
      if (bounds) {
        containerSizeRef.current = { width: bounds.width, height: bounds.height };
      }
      overlayNeedsResizeSyncRef.current = true;
      logRemap("window-resize");
    };
    const onOrientationChange = () => {
      overlayNeedsResizeSyncRef.current = true;
      logRemap("orientation-change");
    };
    const onFullscreenChange = () => {
      overlayNeedsResizeSyncRef.current = true;
      logRemap("fullscreen-change");
    };
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("orientationchange", onOrientationChange);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.visualViewport?.addEventListener("resize", onWindowResize);
    return () => {
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("orientationchange", onOrientationChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.visualViewport?.removeEventListener("resize", onWindowResize);
    };
  }, [isRearCamera]);

  useEffect(() => {
    rawReplayUrlRef.current = rawReplayUrl;
  }, [rawReplayUrl]);

  useEffect(() => {
    annotatedReplayUrlRef.current = annotatedReplayUrl;
  }, [annotatedReplayUrl]);

  useEffect(() => {
    return () => {
      void cleanupSession({ stopRecorder: true, discardRecording: true });
      if (annotatedReplayUrlRef.current) URL.revokeObjectURL(annotatedReplayUrlRef.current);
      if (rawReplayUrlRef.current) URL.revokeObjectURL(rawReplayUrlRef.current);
    };
  }, [cleanupSession]);

  const buildStabilizedPoseFrame = useCallback(
    (landmarks: Array<{ x: number; y: number; visibility?: number }>, timestampMs: number) => {
      const video = previewVideoRef.current;
      const incoming = mapLandmarksToPoseFrame(landmarks, timestampMs, {
        frameWidth: video?.videoWidth,
        frameHeight: video?.videoHeight,
        mirrored: !isRearCamera
      });
      const previous = smoothedFrameRef.current;
      const nextJoints: ReturnType<typeof mapLandmarksToPoseFrame>["joints"] = {};

      for (const [jointName, point] of Object.entries(incoming.joints)) {
        if (!point) {
          continue;
        }
        const canonicalJointName = jointName as CanonicalJointName;
        const confidence = point.confidence ?? 1;
        const wasVisible = jointVisibleRef.current[jointName] ?? false;
        const nowVisible = wasVisible ? confidence >= JOINT_VISIBILITY_EXIT_THRESHOLD : confidence >= JOINT_VISIBILITY_ENTER_THRESHOLD;
        jointVisibleRef.current[jointName] = nowVisible;

        const previousPoint = previous?.joints[canonicalJointName];
        if (!nowVisible) {
          const graceCount = jointGraceSamplesRef.current[jointName] ?? 0;
          if (previousPoint && graceCount < JOINT_VISIBILITY_GRACE_SAMPLES) {
            jointGraceSamplesRef.current[jointName] = graceCount + 1;
            nextJoints[canonicalJointName] = previousPoint;
          }
          continue;
        }

        jointGraceSamplesRef.current[jointName] = 0;
        if (!previousPoint) {
          nextJoints[canonicalJointName] = point;
          continue;
        }

        nextJoints[canonicalJointName] = {
          x: previousPoint.x + (point.x - previousPoint.x) * LANDMARK_SMOOTHING_ALPHA,
          y: previousPoint.y + (point.y - previousPoint.y) * LANDMARK_SMOOTHING_ALPHA,
          confidence
        };
      }

      const stabilized = { timestampMs, joints: nextJoints };
      smoothedFrameRef.current = stabilized;
      return stabilized;
    },
    [isRearCamera]
  );

  const startSession = useCallback(async () => {
    if (status === "requesting-permission" || status === "live-session-running" || status === "stopping-finalizing") {
      return;
    }

    setErrorMessage(null);
    setStatus("requesting-permission");
    setIsReferencePanelVisible(false);
    setReplayState("idle");
    setReplayExportStageLabel(null);
    setShowRawDuringProcessing(false);
    setCompletedPreviewSurface("raw");
    setAnnotatedReplayFailureMessage(null);
    setAnnotatedReplayMimeType(null);
    setAnnotatedReplayFailureDetails(null);
    setLiveTrace(null);
    setSelectedMarkerId(null);
    updateFramingWarning(null);
    if (annotatedReplayUrl) {
      URL.revokeObjectURL(annotatedReplayUrl);
      setAnnotatedReplayUrl(null);
      setAnnotatedReplayBlob(null);
      setAnnotatedReplayMimeType(null);
    }
    if (rawReplayUrl) {
      URL.revokeObjectURL(rawReplayUrl);
      setRawReplayUrl(null);
      setRawReplayBlob(null);
      setRawReplayMimeType(null);
    }

    await cleanupSession({ stopRecorder: true, discardRecording: true });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: isRearCamera ? { ideal: "environment" } : { ideal: "user" } },
        audio: false
      });
      const activeVideoTrack = stream.getVideoTracks()[0] ?? null;
      activeVideoTrackRef.current = activeVideoTrack;
      const zoomSupport = getHardwareZoomSupport(activeVideoTrack);
      if (zoomSupport.supported) {
        const availablePresets = getSupportedZoomPresets(zoomSupport, APP_HARDWARE_ZOOM_PRESETS);
        if (availablePresets.length > 0) {
          const defaultZoom = availablePresets.includes(1) ? 1 : selectedZoomRef.current;
          const clampedRequestedZoom = Math.min(zoomSupport.max, Math.max(zoomSupport.min, defaultZoom));
          const appliedZoom = await applyHardwareZoomPreset(activeVideoTrack, clampedRequestedZoom, zoomSupport);
          selectedZoomRef.current = appliedZoom;
          setLiveHardwareZoom({
            supported: true,
            value: appliedZoom,
            min: zoomSupport.min,
            max: zoomSupport.max,
            step: zoomSupport.step,
            presets: availablePresets
          });
          console.info("[live-overlay] hardware-zoom supported", {
            facingMode: isRearCamera ? "rear" : "front",
            min: zoomSupport.min,
            max: zoomSupport.max,
            step: zoomSupport.step,
            presets: availablePresets,
            activeZoom: appliedZoom
          });
        } else {
          selectedZoomRef.current = 1;
          setLiveHardwareZoom({ supported: false, value: 1 });
          console.info("[live-overlay] hardware-zoom unsupported", {
            facingMode: isRearCamera ? "rear" : "front",
            reason: "no_supported_presets",
            min: zoomSupport.min,
            max: zoomSupport.max
          });
        }
      } else {
        selectedZoomRef.current = 1;
        setLiveHardwareZoom({ supported: false, value: 1 });
        console.info("[live-overlay] hardware-zoom unsupported", {
          facingMode: isRearCamera ? "rear" : "front"
        });
      }
      liveStreamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        await previewVideoRef.current.play();
        const width = previewVideoRef.current.videoWidth;
        const height = previewVideoRef.current.videoHeight;
        if (width > 0 && height > 0) {
          setPreviewAspectRatio(width / height);
        }
      }
    } catch (error) {
      const classified = classifyCameraError(error);
      setStatus(classified);
      setErrorMessage(
        classified === "denied"
          ? "Camera permission was denied. Allow camera access and tap Start live session to retry."
          : classified === "unsupported"
            ? "No usable camera found on this device/browser."
            : "Unable to start camera."
      );
      return;
    }

    const video = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    const container = mediaContainerRef.current;
    if (!video || !canvas || !container) {
      await cleanupSession({ stopRecorder: true, discardRecording: true });
      setStatus("failed");
      setErrorMessage("Live preview surface is unavailable. Retry to start a new session.");
      return;
    }

    syncOverlayCanvasSize(true);
    const previewReady = isPreviewSurfaceReady({
      readyState: video.readyState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      containerWidth: Math.round(container.getBoundingClientRect().width),
      containerHeight: Math.round(container.getBoundingClientRect().height),
      canvasWidth: canvas.width,
      canvasHeight: canvas.height
    });
    if (!previewReady) {
      await cleanupSession({ stopRecorder: true, discardRecording: true });
      setStatus("failed");
      setErrorMessage("Camera preview is not ready yet. Retry after camera initialization completes.");
      logOverlayDiagnostics("start-blocked-preview-not-ready");
      return;
    }

    setStatus("live-session-running");

    try {
      const landmarker = await createPoseLandmarkerForJob();
      landmarkerRef.current = landmarker;
      const recorder = createMediaRecorder(stream);
      recorderRef.current = recorder;
      startedAtRef.current = performance.now();
      mediaStartMsRef.current = Math.max(0, video.currentTime * 1000);
      lastAcceptedLandmarkPerfNowRef.current = startedAtRef.current;

      traceRef.current = createLiveTraceAccumulator({
        traceId: `live_${Date.now()}`,
        startedAtIso: new Date().toISOString(),
        cadenceFps: LIVE_ANALYSIS_CADENCE_FPS,
        drillSelection: selection
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to initialize live overlay.";
      setStatus("failed");
      setErrorMessage(message);
      await cleanupSession({ stopRecorder: true, discardRecording: true });
      return;
    }

    overlayNeedsResizeSyncRef.current = true;
    syncOverlayCanvasSize(true);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let nextAnalysisAtMs = 0;
    let nextPresentationAtMs = 0;
    const draw = () => {
      if (!previewVideoRef.current || !landmarkerRef.current || !traceRef.current) {
        return;
      }

      const elapsedMs = performance.now() - startedAtRef.current;
      liveCadenceStatsRef.current.renderFrames += 1;
      const previewVideo = previewVideoRef.current;
      syncOverlayCanvasSize();
      const projection = overlayProjectionRef.current;
      if (!previewVideo || !projection) {
        liveLoopRef.current = requestAnimationFrame(draw);
        return;
      }
      const mediaTimeMs = Math.max(mediaStartMsRef.current, previewVideo.currentTime * 1000);
      const elapsedTraceTimestampMs = Math.max(0, Math.round(elapsedMs));
      const mediaTraceTimestampMs = Math.max(0, Math.round(mediaTimeMs - mediaStartMsRef.current));
      const traceTimestampMs = Math.max(lastPoseFrameAtRef.current + LIVE_MIN_TRACE_TIMESTAMP_STEP_MS, Math.max(mediaTraceTimestampMs, elapsedTraceTimestampMs));
      const pixelRatio = overlayPixelRatioRef.current;
      if (
        !isPreviewSurfaceReady({
          readyState: previewVideo.readyState,
          videoWidth: previewVideo.videoWidth,
          videoHeight: previewVideo.videoHeight,
          containerWidth: Math.round(containerSizeRef.current.width),
          containerHeight: Math.round(containerSizeRef.current.height),
          canvasWidth: canvas.width,
          canvasHeight: canvas.height
        })
      ) {
        logOverlayDiagnostics("draw-skipped-preview-not-ready");
        liveLoopRef.current = requestAnimationFrame(draw);
        return;
      }

      if (elapsedMs >= nextAnalysisAtMs) {
        let detectionTimestampMs = Math.max(lastDetectionTimestampRef.current + 1, Math.round(mediaTimeMs));
        if (Math.round(mediaTimeMs) === lastVideoTimeMsRef.current) {
          repeatedVideoTimestampCountRef.current += 1;
          detectionTimestampMs = Math.max(detectionTimestampMs, Math.round(performance.now()));
        } else {
          repeatedVideoTimestampCountRef.current = 0;
          lastVideoTimeMsRef.current = Math.round(mediaTimeMs);
        }
        const result = landmarkerRef.current.detectForVideo(previewVideo, detectionTimestampMs);
        lastDetectionTimestampRef.current = detectionTimestampMs;
        const landmarks = result.landmarks?.[0];
        liveCadenceStatsRef.current.analysisTicks += 1;
        liveCadenceStatsRef.current.detectionInvocations += 1;
        if (landmarks) {
          const frame = buildStabilizedPoseFrame(landmarks, traceTimestampMs);
          traceRef.current.pushFrame(frame, { sourceMediaTimeMs: mediaTraceTimestampMs });
          lastPoseFrameAtRef.current = traceTimestampMs;
          lastAcceptedLandmarkTimestampRef.current = traceTimestampMs;
          lastAcceptedLandmarkPerfNowRef.current = performance.now();
          liveCadenceStatsRef.current.detectionSuccesses += 1;
          liveCadenceStatsRef.current.landmarkUpdates += 1;
          stalePoseLoggedRef.current = false;
          if (performance.now() - lastTrackingHudUpdateAtRef.current >= LIVE_HUD_UPDATE_INTERVAL_MS) {
            updateTrackingStatus("Tracking active");
            lastTrackingHudUpdateAtRef.current = performance.now();
          }
          if (requiredFramingJoints.length > 0) {
            const missingJoints = requiredFramingJoints.filter((joint) => {
              const point = frame.joints[joint];
              return !point || (point.confidence ?? 0) < JOINT_VISIBILITY_EXIT_THRESHOLD;
            });
            const missingRatio = missingJoints.length / requiredFramingJoints.length;
            if (missingRatio >= 0.35) {
              if (performance.now() - lastFramingHudUpdateAtRef.current >= LIVE_HUD_UPDATE_INTERVAL_MS) {
                updateFramingWarning("Full body not visible. Move back so all required points are in frame.");
                lastFramingHudUpdateAtRef.current = performance.now();
              }
              if (performance.now() - lastDiagnosticLogAtRef.current >= LIVE_DIAGNOSTIC_LOG_INTERVAL_MS) {
                console.warn("[live-overlay] framing-warning", {
                  reason: "required_joints_missing",
                  missingCount: missingJoints.length,
                  requiredCount: requiredFramingJoints.length,
                  missingJoints
                });
              }
            } else {
              if (performance.now() - lastFramingHudUpdateAtRef.current >= LIVE_HUD_UPDATE_INTERVAL_MS) {
                updateFramingWarning(null);
                lastFramingHudUpdateAtRef.current = performance.now();
              }
            }
          }
          logOverlayDiagnostics("draw-pose-frame");
        } else if (!stalePoseLoggedRef.current) {
          console.debug("[live-overlay] pose miss; reusing last stabilized frame", {
            traceTimestampMs,
            staleForMs: Math.max(0, traceTimestampMs - lastPoseFrameAtRef.current)
          });
          stalePoseLoggedRef.current = true;
        }
        nextAnalysisAtMs = elapsedMs + LIVE_ANALYSIS_INTERVAL_MS;
      }

      if (elapsedMs < nextPresentationAtMs) {
        liveLoopRef.current = requestAnimationFrame(draw);
        return;
      }

      nextPresentationAtMs = elapsedMs + LIVE_PRESENTATION_INTERVAL_MS;
      liveCadenceStatsRef.current.presentationTicks += 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const analyzedFrameState = traceRef.current.getAnalyzedFrameState(traceTimestampMs);
      const staleForMs = Math.max(0, traceTimestampMs - lastPoseFrameAtRef.current);
      const staleLandmarkAgeMs = Math.max(0, Math.round(performance.now() - lastAcceptedLandmarkPerfNowRef.current));
      const canReuseStalePose = lastPoseFrameAtRef.current > 0 && staleForMs <= LIVE_POSE_STALE_HOLD_MS;
      if (analyzedFrameState.poseFrame && canReuseStalePose) {
        if (staleForMs > LIVE_ANALYSIS_INTERVAL_MS) {
          liveCadenceStatsRef.current.stalePoseReuseCount += 1;
        }
        lastRenderedLandmarkTimestampRef.current = analyzedFrameState.poseFrame.timestampMs;
        drawPoseOverlay(ctx, canvas.width / pixelRatio, canvas.height / pixelRatio, analyzedFrameState.poseFrame, { projection });
      } else if (staleLandmarkAgeMs >= LIVE_POSE_STALE_WARNING_MS) {
        if (performance.now() - lastTrackingHudUpdateAtRef.current >= LIVE_HUD_UPDATE_INTERVAL_MS) {
          updateTrackingStatus("Tracking lost");
          lastTrackingHudUpdateAtRef.current = performance.now();
        }
      } else if (staleForMs > LIVE_POSE_STALE_HOLD_MS && stalePoseLoggedRef.current) {
        console.info("[live-overlay] stale pose timeout reached; clearing overlay skeleton", {
          traceTimestampMs,
          staleForMs,
          staleTimeoutMs: LIVE_POSE_STALE_HOLD_MS
        });
        stalePoseLoggedRef.current = false;
      }

      if (performance.now() - lastDiagnosticLogAtRef.current >= LIVE_DIAGNOSTIC_LOG_INTERVAL_MS) {
        lastDiagnosticLogAtRef.current = performance.now();
        console.info("[live-overlay] pose-freshness", {
          sourceVideoCurrentTimeMs: Math.round(previewVideo.currentTime * 1000),
          sourceVideoDimensions: `${previewVideo.videoWidth}x${previewVideo.videoHeight}`,
          renderFrameCounter: liveCadenceStatsRef.current.renderFrames,
          poseDetectionInvocationCounter: liveCadenceStatsRef.current.detectionInvocations,
          poseDetectionSuccessCounter: liveCadenceStatsRef.current.detectionSuccesses,
          landmarkUpdateCounter: liveCadenceStatsRef.current.landmarkUpdates,
          latestAcceptedLandmarkTimestampMs: lastAcceptedLandmarkTimestampRef.current,
          renderedLandmarkTimestampMs: lastRenderedLandmarkTimestampRef.current,
          renderedLandmarkAgeMs: staleLandmarkAgeMs,
          reusedPreviousLandmarks: canReuseStalePose && staleForMs > LIVE_ANALYSIS_INTERVAL_MS,
          repeatedVideoTimestampCount: repeatedVideoTimestampCountRef.current
        });
      }

      drawAnalysisOverlay(ctx, canvas.width / pixelRatio, canvas.height / pixelRatio, analyzedFrameState.overlay, {
        modeLabel: selection.drillBindingLabel,
        showDrillMetrics: selection.mode === "drill",
        phaseLabels: phaseLabelMap
      });

      liveLoopRef.current = requestAnimationFrame(draw);
    };

    draw();
  }, [annotatedReplayUrl, buildStabilizedPoseFrame, cleanupSession, isRearCamera, logOverlayDiagnostics, phaseLabelMap, rawReplayUrl, requiredFramingJoints, selection, status, syncOverlayCanvasSize, updateFramingWarning, updateTrackingStatus]);

  const updateHardwareZoom = useCallback(
    async (presetZoom: number) => {
      const activeTrack = activeVideoTrackRef.current;
      if (!activeTrack || !liveHardwareZoom.supported || status !== "live-session-running") {
        return;
      }
      try {
        const appliedZoom = await applyHardwareZoomPreset(activeTrack, presetZoom, { ...liveHardwareZoom, current: liveHardwareZoom.value });
        selectedZoomRef.current = appliedZoom;
        setLiveHardwareZoom((current) => (current.supported ? { ...current, value: appliedZoom } : current));
        overlayNeedsResizeSyncRef.current = true;
        syncOverlayCanvasSize(true);
        console.info("[live-overlay] hardware-zoom updated", {
          presetZoom,
          activeZoom: appliedZoom
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to apply hardware zoom.";
        console.warn("[live-overlay] hardware-zoom apply failed", { message });
      }
    },
    [liveHardwareZoom, status, syncOverlayCanvasSize]
  );

  const toggleSessionFullscreen = useCallback(async () => {
    const stageEl = sessionStageRef.current;
    if (!stageEl || typeof document === "undefined") {
      return;
    }
    if (document.fullscreenElement === stageEl) {
      await document.exitFullscreen?.();
      return;
    }
    if (typeof stageEl.requestFullscreen === "function") {
      await stageEl.requestFullscreen();
    }
  }, []);

  const resetToIdle = useCallback(async () => {
    await cleanupSession({ stopRecorder: true, discardRecording: true, nextStatus: "idle" });
    if (annotatedReplayUrl) {
      URL.revokeObjectURL(annotatedReplayUrl);
      setAnnotatedReplayUrl(null);
      setAnnotatedReplayBlob(null);
      setAnnotatedReplayMimeType(null);
    }
    if (rawReplayUrl) {
      URL.revokeObjectURL(rawReplayUrl);
      setRawReplayUrl(null);
      setRawReplayBlob(null);
      setRawReplayMimeType(null);
    }
    setLiveTrace(null);
    setReplayState("idle");
    setReplayExportStageLabel(null);
    setShowRawDuringProcessing(false);
    setCompletedPreviewSurface("raw");
    setAnnotatedReplayFailureMessage(null);
    setAnnotatedReplayMimeType(null);
    setAnnotatedReplayFailureDetails(null);
    setSelectedMarkerId(null);
    setErrorMessage(null);
  }, [annotatedReplayUrl, cleanupSession, rawReplayUrl]);

  const stopSession = useCallback(async () => {
    if (!recorderRef.current || !traceRef.current || !previewVideoRef.current) return;
    setStatus("stopping-finalizing");

    const recorder = recorderRef.current;
    const traceAccumulator = traceRef.current;
    const cadenceStatsSnapshot = { ...liveCadenceStatsRef.current };
    const captureStopPerfNowMs = performance.now();
    const mediaStopMs = Math.max(mediaStartMsRef.current, previewVideoRef.current.currentTime * 1000);
    const raw = await recorder.stop();
    if (!raw || raw.blob.size <= 0) {
      console.error("[live-overlay] raw-replay-unavailable", {
        hasRecorderResult: Boolean(raw),
        blobSize: raw?.blob.size ?? 0
      });
      setReplayState("export-failed");
      setStatus("failed");
      setErrorMessage("Replay unavailable. Please retake and keep your camera steady.");
      return;
    }
    let metadata: { durationMs: number; width: number; height: number };
    try {
      metadata = await readRecordedVideoMetadata(raw.blob);
    } catch (error) {
      console.error("[live-overlay] raw-metadata-failed", {
        message: error instanceof Error ? error.message : "unknown"
      });
      setReplayState("export-failed");
      setStatus("failed");
      setErrorMessage("Replay metadata could not be read. Please retake.");
      return;
    }
    if (metadata.durationMs <= 0) {
      console.error("[live-overlay] raw-replay-invalid-duration", {
        durationMs: metadata.durationMs,
        blobSize: raw.blob.size
      });
      setReplayState("export-failed");
      setStatus("failed");
      setErrorMessage("Replay duration is invalid. Please retake.");
      return;
    }
    await cleanupSession();

    const completedAtIso = new Date().toISOString();
    const trace = traceAccumulator.finalize(
      {
        durationMs: metadata.durationMs,
        width: metadata.width,
        height: metadata.height,
        mimeType: raw.mimeType,
        sizeBytes: raw.blob.size,
        timing: {
          mediaStartMs: Math.round(mediaStartMsRef.current),
          mediaStopMs: Math.round(mediaStopMs),
          captureStartPerfNowMs: Math.round(startedAtRef.current),
          captureStopPerfNowMs: Math.round(captureStopPerfNowMs)
        }
      },
      completedAtIso
    );
    const traceFreshness = summarizeLiveTraceFreshness(trace);
    const captureDurationMs = Math.max(1, Math.round(mediaStopMs - mediaStartMsRef.current));
    const analysisCadence = Number(((cadenceStatsSnapshot.analysisTicks * 1000) / captureDurationMs).toFixed(2));
    const presentationCadence = Number(((cadenceStatsSnapshot.presentationTicks * 1000) / captureDurationMs).toFixed(2));
    console.info("[live-overlay] cadence-summary", {
      analysisCadenceFps: analysisCadence,
      overlayPresentationCadenceFps: presentationCadence,
      stalePoseReuseCount: cadenceStatsSnapshot.stalePoseReuseCount,
      traceFreshness
    });

    setLiveTrace(trace);
    const rawUrl = URL.createObjectURL(raw.blob);
    setRawReplayUrl(rawUrl);
    setRawReplayBlob(raw.blob);
    setRawReplayMimeType(raw.mimeType);
    console.info("[live-overlay] raw-replay-source-assigned", {
      mimeType: raw.mimeType,
      sizeBytes: raw.blob.size,
      canPlayInCurrentBrowser: canLikelyPlayMimeType(raw.mimeType || "video/webm")
    });
    setReplayState("export-in-progress");
    setReplayExportStageLabel("Preparing export…");
    setShowRawDuringProcessing(false);
    setCompletedPreviewSurface("raw");
    setAnnotatedReplayFailureMessage(null);
    setAnnotatedReplayMimeType(null);
    setAnnotatedReplayFailureDetails(null);
    setPreviewAspectRatio(metadata.width > 0 && metadata.height > 0 ? metadata.width / metadata.height : 16 / 9);

    const analysisSession = buildAnalysisSessionFromLiveTrace(trace);
    const rawFile = new File([raw.blob], `${trace.traceId}.webm`, { type: raw.mimeType });

    try {
      if (!traceFreshness.hasSufficientFreshness) {
        throw new Error(
          `Pose not updating reliably (${traceFreshness.failureReasons.join("; ")}).`
        );
      }
      const annotated = await exportAnnotatedReplayFromLiveTrace({
        rawVideo: rawFile,
        trace,
        analysisSession,
        onProgress: (_progress, stageLabel) => {
          setReplayExportStageLabel(stageLabel);
        }
      });
      const annotatedUrl = URL.createObjectURL(annotated.blob);
      setAnnotatedReplayUrl(annotatedUrl);
      setAnnotatedReplayBlob(annotated.blob);
      setAnnotatedReplayMimeType(annotated.mimeType);
      setReplayExportStageLabel("Annotated export complete");
      setReplayState("annotated-ready");
      if (process.env.NODE_ENV !== "production") {
        console.info("[live-overlay] annotated-export-diagnostics", {
          sourceDurationSec: annotated.diagnostics.sourceDurationSec,
          targetFps: annotated.diagnostics.renderFpsTarget,
          expectedFrameCount: Math.max(1, Math.floor(annotated.diagnostics.sourceDurationSec * annotated.diagnostics.renderFpsTarget) + 1),
          emittedFrameCount: annotated.diagnostics.renderedFrameCount,
          firstTimestampMs: annotated.diagnostics.firstFrameTsMs,
          lastTimestampMs: annotated.diagnostics.lastFrameTsMs,
          encodedDurationSec: annotated.diagnostics.actualOutputDurationSec,
          expectedDurationSec: annotated.diagnostics.expectedOutputDurationSec
        });
        if (
          typeof annotated.diagnostics.actualOutputDurationSec === "number" &&
          annotated.diagnostics.actualOutputDurationSec > annotated.diagnostics.expectedOutputDurationSec + 0.35
        ) {
          console.warn("[live-overlay] annotated-export-duration-out-of-bounds", {
            expectedOutputDurationSec: annotated.diagnostics.expectedOutputDurationSec,
            actualOutputDurationSec: annotated.diagnostics.actualOutputDurationSec
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Annotated replay generation failed.";
      console.error("[live-overlay] annotated export failed", { message });
      setReplayState("raw-fallback");
      setReplayExportStageLabel("Annotated export failed");
      setAnnotatedReplayFailureMessage("Annotated video could not be generated. Your raw video is still available.");
      setAnnotatedReplayFailureDetails(message);
      setAnnotatedReplayBlob(null);
      setAnnotatedReplayMimeType(null);
    }

    setStatus("completed");
  }, [cleanupSession]);

  const showReferencePanel = isReferencePanelVisible;

  return (
    <section className={`panel-content live-streaming-layout ${isSessionStageActive ? "live-streaming-layout--session-active" : ""}`}>
      <div className={`card live-streaming-intro-card ${isSessionStageActive ? "live-streaming-passive-chrome-hidden" : ""}`}>
        <strong>Live session setup</strong>
        <p className="muted" style={{ margin: "0.35rem 0 0" }}>
          Pick your camera + drill settings, then start the session. The live stage appears below the setup row and runs lightweight overlay analysis in real time.
        </p>
      </div>

      {/* Shared setup shell keeps Upload and Live aligned while preserving source-specific inputs. */}
      <div className={isSessionStageActive ? "live-streaming-passive-chrome-hidden" : undefined}>
      <DrillSetupShell
        showReferencePanel={showReferencePanel}
        leftPane={
          <div style={{ display: "grid", gap: "0.85rem" }}>
            <DrillSetupHeader
              title="Live Streaming"
              description={
                status === "live-session-running"
                  ? "Camera session is active. Reference animation can stay collapsed while you capture."
                  : "Reference animation is optional while you set up your camera session."
              }
              showReferencePanel={showReferencePanel}
              onToggleReferencePanel={() => setIsReferencePanelVisible((current) => !current)}
            />
            <article className="card drill-setup-shell-card" style={{ display: "grid", gap: "0.8rem" }}>
              <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>
                Live overlay runs at {LIVE_ANALYSIS_CADENCE_FPS} FPS analysis / {LIVE_OVERLAY_PRESENTATION_FPS} FPS presentation with automatic raw + annotated replay export.
              </p>
              <div className="live-streaming-control-row">
                <label className="live-streaming-control-field">
                  <span>Camera</span>
                  <select
                    className="live-streaming-control-input"
                    value={isRearCamera ? "rear" : "front"}
                    onChange={(event) => {
                      const nextRear = event.target.value === "rear";
                      setIsRearCamera(nextRear);
                      console.info("[live-overlay] camera-selection changed", {
                        facingMode: nextRear ? "rear" : "front"
                      });
                    }}
                    disabled={status === "live-session-running" || status === "requesting-permission"}
                  >
                    <option value="rear">Rear camera</option>
                    <option value="front">Front camera</option>
                  </select>
                </label>
                <label className="live-streaming-control-field">
                  <span>Analysis mode</span>
                  <select
                    className="live-streaming-control-input"
                    value={selectedSource}
                    onChange={(event) => setSelectedSource(event.target.value as DrillSourceKind)}
                    disabled={status === "live-session-running" || status === "requesting-permission"}
                  >
                    {DRILL_SOURCE_ORDER.map((source) => (
                      <option key={source} value={source}>
                        {formatDrillSourceLabel(source)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="live-streaming-control-field">
                  <span>Drill</span>
                  <select
                    className="live-streaming-control-input"
                    value={selectedKey}
                    onChange={(event) => setSelectedKey(event.target.value)}
                    disabled={status === "live-session-running" || status === "requesting-permission"}
                  >
                    <option value={FREESTYLE_KEY}>No drill · Freestyle</option>
                    {visibleDrillOptions.length === 0 ? (
                      <option value={FREESTYLE_KEY} disabled>
                        No {formatDrillSourceLabel(selectedSource).toLowerCase()} drills available
                      </option>
                    ) : (
                      <optgroup label={`${formatDrillSourceLabel(selectedSource)} drills`}>
                        {visibleDrillOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.displayLabel}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
                <div className="live-streaming-control-field live-streaming-control-field--actions">
                  <span>Session</span>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {status === "live-session-running" ? (
                      <button type="button" className="studio-button studio-button-danger" onClick={() => void stopSession()}>
                        Stop session
                      </button>
                    ) : null}
                    {(status === "idle" || status === "failed" || status === "denied") && (
                      <button type="button" className="studio-button studio-button-primary" onClick={() => void startSession()}>
                        Start live session
                      </button>
                    )}
                    {status === "requesting-permission" ? (
                      <button type="button" className="studio-button studio-button-primary" disabled>
                        Starting camera...
                      </button>
                    ) : null}
                    {status === "completed" ? (
                      <>
                        {replayDownloads.includes("annotated") && annotatedReplayUrl ? (
                          <button type="button" className="studio-button studio-button-primary" onClick={() => triggerDownload(annotatedReplayUrl, `${liveTrace?.traceId ?? "live-session"}-annotated.${extensionFromMimeType(annotatedReplayMimeType)}`)}
                            title={replayDownloadSafety.annotated?.warning ?? undefined}>
                            {annotatedDownloadLabel}
                          </button>
                        ) : null}
                        {replayDownloads.includes("raw") && rawReplayUrl ? (
                          <button type="button" className="studio-button" onClick={() => triggerDownload(rawReplayUrl, `${liveTrace?.traceId ?? "live-session"}-raw.${extensionFromMimeType(rawReplayMimeType)}`)}
                            title={replayDownloadSafety.raw?.warning ?? undefined}>
                            {rawDownloadLabel}
                          </button>
                        ) : null}
                        <button type="button" className="studio-button" onClick={() => void startSession()}>
                          Retake
                        </button>
                        <button type="button" className="studio-button studio-button-danger" onClick={() => void resetToIdle()}>
                          Discard
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
              {(status === "unsupported" || status === "stopping-finalizing") && !errorMessage ? (
                <p style={{ margin: 0, color: "#f2bbbb" }}>{status === "unsupported" ? "Live sessions are unavailable in this browser." : "Finalizing session..."}</p>
              ) : null}
              {errorMessage ? <p style={{ margin: 0, color: "#f2bbbb" }}>{errorMessage}</p> : null}
            </article>
          </div>
        }
        rightPane={
          <ReferenceAnimationPanel
            drill={selectedDrill?.drill ?? null}
            sourceKind={selectedDrill?.sourceKind}
            freestyleDescription="Live Streaming runs camera tracking without drill-specific rep, hold, or phase scoring until a drill is selected."
          />
        }
      />
      </div>

      <article ref={sessionStageRef} className={`card live-streaming-results-card ${isSessionStageActive ? "live-streaming-results-card--session-active" : ""}`}>
        <div className="live-streaming-preview-shell">
          {shouldShowSessionToolbar ? (
            <div className="live-streaming-session-toolbar">
              <div className="pill">Drill: {selection.drillBindingLabel}</div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {status === "live-session-running" ? (
                  <button type="button" className="studio-button studio-button-danger" onClick={() => void stopSession()}>
                    Stop session
                  </button>
                ) : null}
                {isFullscreenSupported ? (
                  <button type="button" className="studio-button" onClick={() => void toggleSessionFullscreen()}>
                    {isStageFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  </button>
                ) : (
                  <span className="pill">Fullscreen unavailable</span>
                )}
              </div>
            </div>
          ) : null}
          <div ref={mediaContainerRef} className={`live-streaming-media-container ${isSessionStageActive ? "live-streaming-media-container--session-active" : ""}`} style={{ aspectRatio: previewAspectRatio }}>
            <video
              ref={previewVideoRef}
              muted
              playsInline
              className="live-streaming-video"
              onLoadedMetadata={() => {
                overlayNeedsResizeSyncRef.current = true;
                syncOverlayCanvasSize(true);
                const video = previewVideoRef.current;
                if (video?.videoWidth && video.videoHeight) {
                  setPreviewAspectRatio(video.videoWidth / video.videoHeight);
                }
              }}
              onResize={() => {
                overlayNeedsResizeSyncRef.current = true;
              }}
              style={{ display: status === "completed" ? "none" : "block", transform: isRearCamera ? "none" : "scaleX(-1)" }}
            />
            <canvas ref={previewCanvasRef} className="live-streaming-overlay-canvas" style={{ display: status === "live-session-running" ? "block" : "none" }} />
            {status === "live-session-running" && liveHardwareZoom.supported ? (
              <div className="live-streaming-zoom-control" role="group" aria-label="Hardware camera zoom control">
                <span className="live-streaming-zoom-label">Zoom</span>
                <div className="live-streaming-zoom-presets">
                  {liveHardwareZoom.presets.map((preset) => {
                    const isActive = activeZoomPreset === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        className={`live-streaming-zoom-chip ${isActive ? "is-active" : ""}`}
                        aria-pressed={isActive}
                        onClick={() => {
                          void updateHardwareZoom(preset);
                        }}
                      >
                        {formatHardwareZoomLabel(preset)}
                      </button>
                    );
                  })}
                </div>
                <span>{formatHardwareZoomLabel(liveHardwareZoom.value)}</span>
              </div>
            ) : null}
            {status === "live-session-running" && framingWarning ? <div className="live-streaming-zoom-unsupported">{framingWarning}</div> : null}
          </div>
        </div>

        {liveTrace && liveViewerModel ? (
          <AnalysisViewerShell
            model={{ ...liveViewerModel, progress: replayState === "export-in-progress" ? 0.5 : undefined }}
            videoRef={replayVideoRef}
            onSurfaceChange={(surface) => {
              setCompletedPreviewSurface(surface);
              if (replayState === "export-in-progress") {
                setShowRawDuringProcessing(surface === "raw");
              }
            }}
            onEventSelect={(event) => {
              setSelectedMarkerId(event.id);
              seekVideoToTimestamp(replayVideoRef.current, event.timestampMs);
            }}
          />
        ) : null}
      </article>
    </section>
  );
}
