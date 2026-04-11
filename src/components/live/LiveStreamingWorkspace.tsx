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
import { canToggleCompletedPreview, resolveAvailableDownloads, resolveUnifiedResultPreviewState, type PreviewSurface } from "@/lib/results/preview-state";
import { extensionFromMimeType, resolveSafeDelivery, selectPreferredDeliverySource, selectPreviewSource } from "@/lib/media/media-capabilities";
import { resolveLiveDownloadLabel } from "@/lib/media/download-labels";
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
  getReplayStateMessage,
  getReplayStateTone,
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
  const [rawReplayMimeType, setRawReplayMimeType] = useState<string | null>(null);
  const [annotatedReplayUrl, setAnnotatedReplayUrl] = useState<string | null>(null);
  const [annotatedReplayMimeType, setAnnotatedReplayMimeType] = useState<string | null>(null);
  const [replayState, setReplayState] = useState<ReplayTerminalState>("idle");
  const [replayExportStageLabel, setReplayExportStageLabel] = useState<string | null>(null);
  const [showRawDuringProcessing, setShowRawDuringProcessing] = useState(false);
  const [completedPreviewSurface, setCompletedPreviewSurface] = useState<PreviewSurface>("annotated");
  const [annotatedReplayFailureMessage, setAnnotatedReplayFailureMessage] = useState<string | null>(null);
  const [annotatedReplayFailureDetails, setAnnotatedReplayFailureDetails] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [trackingStatusLabel, setTrackingStatusLabel] = useState<string>("Tracking ready");
  const [framingWarning, setFramingWarning] = useState<string | null>(null);
  const [previewAspectRatio, setPreviewAspectRatio] = useState<number>(16 / 9);
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
  const liveStreamRef = useRef<MediaStream | null>(null);
  const traceRef = useRef<ReturnType<typeof createLiveTraceAccumulator> | null>(null);
  const liveLoopRef = useRef<number | null>(null);
  const recorderRef = useRef<ReturnType<typeof createMediaRecorder> | null>(null);
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
  const stalePoseLoggedRef = useRef(false);
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
  const replayPreviewState = resolveUnifiedResultPreviewState({
    hasRaw: Boolean(rawReplayUrl),
    hasAnnotated: Boolean(annotatedReplayUrl),
    isProcessingAnnotated: replayState === "export-in-progress",
    annotatedFailed: replayState === "raw-fallback" || replayState === "export-failed",
    userRequestedRawDuringProcessing: showRawDuringProcessing,
    preferredCompletedSurface: completedPreviewSurface
  });
  const replayDownloads = resolveAvailableDownloads({ hasRaw: Boolean(rawReplayUrl), hasAnnotated: Boolean(annotatedReplayUrl) });
  const replayPreviewSelection = selectPreviewSource({
    preferredId: replayPreviewState === "showing_annotated_completed" ? "annotated" : "raw",
    sources: [
      ...(annotatedReplayUrl ? [{ id: "annotated" as const, url: annotatedReplayUrl, mimeType: annotatedReplayMimeType }] : []),
      ...(rawReplayUrl ? [{ id: "raw" as const, url: rawReplayUrl, mimeType: rawReplayMimeType }] : [])
    ]
  });
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
  const canToggleReplayPreview = canToggleCompletedPreview({
    hasRaw: Boolean(rawReplayUrl),
    hasAnnotated: Boolean(annotatedReplayUrl),
    isProcessingAnnotated: replayState === "export-in-progress"
  });
  const replayTone = getReplayStateTone(replayState);
  const selectedMarker = useMemo(() => timelineMarkers.find((marker) => marker.id === selectedMarkerId) ?? null, [selectedMarkerId, timelineMarkers]);
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
    if (replayState === "export-failed") {
      return "Replay is unavailable for this session. Retake the drill and keep your full body in frame.";
    }
    if (!rawReplayUrl && !annotatedReplayUrl) {
      return "Replay is unavailable for this session. Retake and keep your camera stable.";
    }
    return null;
  }, [annotatedReplayUrl, rawReplayUrl, replayPreviewSelection.warning, replayState]);

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
      selectedSource: replayPreviewSelection.source?.id ?? "none",
      selectedMimeType: replayPreviewSelection.source?.mimeType ?? "unknown",
      appleFallbackTriggered: replayPreviewSelection.blockedByCompatibility,
      annotatedDownload: replayDownloadSafety.annotated?.downloadable ?? "n/a",
      rawDownload: replayDownloadSafety.raw?.downloadable ?? "n/a"
    });
  }, [liveTrace, replayPreviewSelection.source?.id, replayPreviewSelection.source?.mimeType, replayPreviewSelection.blockedByCompatibility, replayDownloadSafety.annotated?.downloadable, replayDownloadSafety.raw?.downloadable]);

  const updateTrackingStatus = useCallback((nextStatus: string) => {
    if (trackingStatusRef.current === nextStatus) {
      return;
    }
    trackingStatusRef.current = nextStatus;
    setTrackingStatusLabel(nextStatus);
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

  const cleanupSession = useCallback(async (options?: { stopRecorder?: boolean; discardRecording?: boolean; nextStatus?: LiveSessionStatus }) => {
    if (liveLoopRef.current) {
      cancelAnimationFrame(liveLoopRef.current);
      liveLoopRef.current = null;
    }
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
  }, [updateFramingWarning, updateTrackingStatus]);

  const syncOverlayCanvasSize = useCallback((force = false) => {
    if (!force && !overlayNeedsResizeSyncRef.current) {
      return;
    }
    const canvas = previewCanvasRef.current;
    const container = mediaContainerRef.current;
    if (!canvas || !container) return;

    const bounds = container.getBoundingClientRect();
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
        fitMode: "cover",
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

    const resizeObserver = new ResizeObserver(() => {
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
    return () => {
      void cleanupSession({ stopRecorder: true, discardRecording: true });
      if (annotatedReplayUrl) URL.revokeObjectURL(annotatedReplayUrl);
      if (rawReplayUrl) URL.revokeObjectURL(rawReplayUrl);
    };
  }, [annotatedReplayUrl, cleanupSession, rawReplayUrl]);

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
    setCompletedPreviewSurface("annotated");
    setAnnotatedReplayFailureMessage(null);
    setAnnotatedReplayMimeType(null);
    setAnnotatedReplayFailureDetails(null);
    setLiveTrace(null);
    setSelectedMarkerId(null);
    updateFramingWarning(null);
    if (annotatedReplayUrl) {
      URL.revokeObjectURL(annotatedReplayUrl);
      setAnnotatedReplayUrl(null);
      setAnnotatedReplayMimeType(null);
    }
    if (rawReplayUrl) {
      URL.revokeObjectURL(rawReplayUrl);
      setRawReplayUrl(null);
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
          containerWidth: Math.round(mediaContainerRef.current?.getBoundingClientRect().width ?? 0),
          containerHeight: Math.round(mediaContainerRef.current?.getBoundingClientRect().height ?? 0),
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
          updateTrackingStatus("Tracking active");
          if (requiredFramingJoints.length > 0) {
            const missingJoints = requiredFramingJoints.filter((joint) => {
              const point = frame.joints[joint];
              return !point || (point.confidence ?? 0) < JOINT_VISIBILITY_EXIT_THRESHOLD;
            });
            const missingRatio = missingJoints.length / requiredFramingJoints.length;
            if (missingRatio >= 0.35) {
              updateFramingWarning("Full body not visible. Move back so all required points are in frame.");
              if (performance.now() - lastDiagnosticLogAtRef.current >= LIVE_DIAGNOSTIC_LOG_INTERVAL_MS) {
                console.warn("[live-overlay] framing-warning", {
                  reason: "required_joints_missing",
                  missingCount: missingJoints.length,
                  requiredCount: requiredFramingJoints.length,
                  missingJoints
                });
              }
            } else {
              updateFramingWarning(null);
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
        updateTrackingStatus("Tracking lost");
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

  const resetToIdle = useCallback(async () => {
    await cleanupSession({ stopRecorder: true, discardRecording: true, nextStatus: "idle" });
    if (annotatedReplayUrl) {
      URL.revokeObjectURL(annotatedReplayUrl);
      setAnnotatedReplayUrl(null);
      setAnnotatedReplayMimeType(null);
    }
    if (rawReplayUrl) {
      URL.revokeObjectURL(rawReplayUrl);
      setRawReplayUrl(null);
      setRawReplayMimeType(null);
    }
    setLiveTrace(null);
    setReplayState("idle");
    setReplayExportStageLabel(null);
    setShowRawDuringProcessing(false);
    setCompletedPreviewSurface("annotated");
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
    setRawReplayMimeType(raw.mimeType);
    setReplayState("export-in-progress");
    setReplayExportStageLabel("Preparing export…");
    setShowRawDuringProcessing(false);
    setCompletedPreviewSurface("annotated");
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
      setAnnotatedReplayMimeType(annotated.mimeType);
      setReplayExportStageLabel("Annotated export complete");
      setReplayState("annotated-ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Annotated replay generation failed.";
      console.error("[live-overlay] annotated export failed", { message });
      setReplayState("raw-fallback");
      setReplayExportStageLabel("Annotated export failed");
      setAnnotatedReplayFailureMessage("Annotated video could not be generated. Your raw video is still available.");
      setAnnotatedReplayFailureDetails(message);
      setAnnotatedReplayMimeType(null);
    }

    setStatus("completed");
  }, [cleanupSession]);

  const showReferencePanel = isReferencePanelVisible;

  return (
    <section className="panel-content live-streaming-layout">
      <div className="card live-streaming-intro-card">
        <strong>Live session setup</strong>
        <p className="muted" style={{ margin: "0.35rem 0 0" }}>
          Pick your camera + drill settings, then start the session. The live stage appears below the setup row and runs lightweight overlay analysis in real time.
        </p>
      </div>

      {/* Shared setup shell keeps Upload and Live aligned while preserving source-specific inputs. */}
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

      <article className="card live-streaming-results-card">
        <div className="live-streaming-preview-shell">
          <div ref={mediaContainerRef} className="live-streaming-media-container" style={{ aspectRatio: previewAspectRatio }}>
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

        {liveTrace ? (
          <>
            <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              <div className="pill">Drill: {summary?.drillLabel ?? "Freestyle"}</div>
              <div className="pill">Duration: {summary?.durationLabel ?? "0s"}</div>
              <div className="pill">Reps: {summary?.repCount ?? 0}</div>
              <div className="pill">Holds: {summary?.holdSummaryLabel ?? "No holds detected"}</div>
              {selection.cameraView ? <div className="pill">Camera View: {formatCameraViewLabel(selection.cameraView)}</div> : null}
              <div className="pill">Phases: {summary?.phaseSummaryLabel ?? "No phase transitions detected"}</div>
              <div
                className="pill"
                style={{
                  color: trackingStatusLabel === "Tracking active" ? "#8ce7bf" : trackingStatusLabel === "Tracking lost" ? "#f7d58b" : undefined
                }}
              >
                {trackingStatusLabel}
              </div>
              <div
                className="pill"
                style={{
                  color: replayTone === "success" ? "#8ce7bf" : replayTone === "warning" ? "#f7d58b" : replayTone === "danger" ? "#f2bbbb" : undefined
                }}
              >
                Replay: {getReplayStateMessage(replayState)}
                {replayState === "export-in-progress" && replayExportStageLabel ? ` · ${replayExportStageLabel}` : ""}
              </div>
            </div>

            {replayPreviewState === "processing_annotated" ? (
              <div className="result-preview-processing">
                <strong>Generating annotated video</strong>
                <p className="muted">You can preview the raw recording while this finishes.</p>
                <p className="muted" style={{ margin: 0 }}>{replayExportStageLabel ?? "Processing export…"}</p>
                <button type="button" className="pill" onClick={() => setShowRawDuringProcessing(true)}>Show raw instead</button>
              </div>
            ) : null}
            {replayPreviewState === "annotated_failed_showing_raw" ? (
              <div className="result-preview-warning">
                <strong>{annotatedReplayFailureMessage ?? "Annotated video could not be generated. Your raw video is still available."}</strong>
                {annotatedReplayFailureDetails ? (
                  <details style={{ marginTop: "0.3rem" }}>
                    <summary className="muted" style={{ cursor: "pointer" }}>Technical details</summary>
                    <pre className="muted" style={{ whiteSpace: "pre-wrap", marginTop: "0.35rem" }}>{annotatedReplayFailureDetails}</pre>
                  </details>
                ) : null}
              </div>
            ) : null}
            {replayPreviewSelection.warning ? (
              <div className="result-preview-warning">
                <strong>{replayPreviewSelection.warning}</strong>
              </div>
            ) : null}
            {preferredReplayDeliverySource ? <p className="muted" style={{ margin: 0 }}>Recommended delivery: {preferredReplayDeliverySource.id === "annotated" ? "Annotated" : "Raw"}</p> : null}
            {(replayPreviewState === "showing_annotated_completed" || replayPreviewState === "showing_raw_completed" || replayPreviewState === "showing_raw_during_processing" || replayPreviewState === "annotated_failed_showing_raw") && replayUrl ? (
              <video ref={replayVideoRef} controls src={replayUrl} style={{ width: "100%", borderRadius: "0.8rem", aspectRatio: previewAspectRatio }} />
            ) : null}
            {!replayUrl && replayUnavailableMessage ? <div className="result-preview-warning"><strong>{replayUnavailableMessage}</strong></div> : null}
            {replayDownloadSafety.annotated?.warning ? <p className="muted" style={{ margin: 0 }}>{replayDownloadSafety.annotated.warning}</p> : null}
            {replayDownloadSafety.raw?.warning ? <p className="muted" style={{ margin: 0 }}>{replayDownloadSafety.raw.warning}</p> : null}
            {canToggleReplayPreview ? (
              <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: "999px", overflow: "hidden" }}>
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

            <section style={{ display: "grid", gap: "0.45rem" }}>
              <strong>Timeline</strong>
              <p className="muted" style={{ margin: 0 }}>Click an event to jump in replay.</p>
              <div style={{ position: "relative", height: "1.3rem", border: "1px solid var(--border)", borderRadius: "999px", background: "rgba(255,255,255,0.04)" }}>
                {timelineMarkers.map((marker) => {
                  const leftPercent = liveTrace.video.durationMs > 0 ? (marker.timestampMs / liveTrace.video.durationMs) * 100 : 0;
                  return (
                    <button
                      key={marker.id}
                      type="button"
                      title={marker.label}
                      aria-label={marker.label}
                      aria-pressed={marker.id === selectedMarkerId}
                      onClick={() => {
                        setSelectedMarkerId(marker.id);
                        const replayVideo = replayVideoRef.current;
                        if (!replayVideo) {
                          console.warn("[live-overlay] replay-seek-skipped", { reason: "missing_replay_element", markerId: marker.id });
                          return;
                        }
                        const wasPlaying = !replayVideo.paused && !replayVideo.ended;
                        replayVideo.currentTime = Math.max(0, marker.timestampMs / 1000);
                        if (wasPlaying) {
                          void replayVideo.play().catch(() => {
                            console.warn("[live-overlay] replay-seek-play-failed", { markerId: marker.id });
                          });
                        }
                      }}
                      style={{
                        position: "absolute",
                        left: `${Math.min(99, Math.max(0, leftPercent))}%`,
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                        border: 0,
                        borderRadius: "999px",
                        width: "0.7rem",
                        height: "0.7rem",
                        background: marker.kind === "rep" ? "#9b9dff" : marker.kind === "hold" ? "#8ce7bf" : "#f7d58b"
                      }}
                    />
                  );
                })}
              </div>
              {selectedMarker ? (
                <div className="pill" style={{ borderColor: "var(--border-strong)" }}>
                  Selected event: {selectedMarker.label}
                </div>
              ) : null}
              <div style={{ display: "grid", gap: "0.35rem" }}>
                {timelineMarkers.slice(0, 12).map((marker) => {
                  const isActive = marker.id === selectedMarkerId;
                  return (
                    <button
                      key={`${marker.id}_label`}
                      type="button"
                      className="studio-button"
                      onClick={() => {
                        setSelectedMarkerId(marker.id);
                        const replayVideo = replayVideoRef.current;
                        if (!replayVideo) {
                          console.warn("[live-overlay] replay-seek-skipped", { reason: "missing_replay_element", markerId: marker.id });
                          return;
                        }
                        const wasPlaying = !replayVideo.paused && !replayVideo.ended;
                        replayVideo.currentTime = Math.max(0, marker.timestampMs / 1000);
                        if (wasPlaying) {
                          void replayVideo.play().catch(() => {
                            console.warn("[live-overlay] replay-seek-play-failed", { markerId: marker.id });
                          });
                        }
                      }}
                      style={{
                        justifyContent: "flex-start",
                        borderColor: isActive ? "var(--border-strong)" : "var(--border)",
                        background: isActive ? "rgba(255,255,255,0.12)" : undefined
                      }}
                    >
                      {marker.label}
                    </button>
                  );
                })}
              </div>
            </section>

          </>
        ) : null}
      </article>
    </section>
  );
}
