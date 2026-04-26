"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { createOverlayProjectionFromLayout, isPreviewSurfaceReady, resolveOverlayCanvasSize, resolvePreviewContainerSize, type OverlayProjection } from "@/lib/live/overlay-geometry";
import type { CanonicalJointName } from "@/lib/schema/contracts";
import { formatDurationShort } from "@/lib/format/duration";
import { DrillSetupHeader } from "@/components/workflow-setup/DrillSetupHeader";
import { DrillSetupShell } from "@/components/workflow-setup/DrillSetupShell";
import { ReferenceAnimationPanel } from "@/components/workflow-setup/ReferenceAnimationPanel";
import { CaptureSetupGuidance } from "@/components/workflow-setup/CaptureSetupGuidance";
import { buildBenchmarkCoachingFeedback, buildRuntimePhaseLabelMap, formatCameraViewLabel, formatPhaseSequenceSummary, resolveDrillCameraViewWithDiagnostics } from "@/lib/analysis";
import { createPoseLandmarkerForJob, mapLandmarksToPoseFrame } from "@/lib/workflow/pose-landmarker";
import { drawAnalysisOverlay, drawPoseOverlay, getNearestPoseFrame } from "@/lib/workflow/pose-overlay";
import { createCenterOfGravityTracker } from "@/lib/workflow/center-of-gravity";
import type { PreviewSurface } from "@/lib/results/preview-state";
import { canLikelyPlayMimeType, extensionFromMimeType, resolveSafeDelivery, selectPreferredDeliverySource, selectPreviewSource } from "@/lib/media/media-capabilities";
import { resolveUploadDownloadLabel } from "@/lib/media/download-labels";
import { formatAnnotatedRenderProgressLabel } from "@/lib/analysis-viewer/progress-status";
import { mapLiveAnalysisToViewerModel } from "@/lib/analysis-viewer/adapters";
import { buildAnalysisReviewModel } from "@/lib/analysis-viewer/review-model";
import { buildSavedAttemptSummary } from "@/lib/history/attempt-summary";
import { resolveBrowserAttemptHistoryRepository } from "@/lib/history/repository";
import { buildAnalysisDomainModel, buildAnalysisPanelModel } from "@/lib/analysis-viewer/analysis-domain";
import { seekVideoToTimestamp } from "@/lib/analysis-viewer/behavior";
import { buildReplayAnalysisState } from "@/lib/analysis/replay-analysis-state";
import { resolveResultDownloadTargets } from "@/lib/results/download-actions";
import {
  APP_HARDWARE_ZOOM_PRESETS,
  applyHardwareZoomPreset,
  buildLiveResultsSummary,
  buildVideoInputDescriptors,
  chooseBestRearCameraForZoomPreset,
  chooseBestRearMainCamera,
  classifyCameraError,
  createLiveTraceAccumulator,
  createMediaRecorder,
  exportAnnotatedReplayFromLiveTrace,
  formatHardwareZoomLabel,
  getCameraSupportStatus,
  getHardwareZoomSupport,
  getSupportedZoomPresets,
  mapLiveTraceToTimelineMarkers,
  replaceStreamSafely,
  resolveHalfXAccessDecision,
  resolveSelectedZoomPreset,
  type VideoInputDescriptor,
  stopMediaStream,
  summarizeLiveTraceFreshness,
  canUseLiveAudioCues,
  createLiveAudioCueController,
  type LiveAudioCueStyle,
  type LiveDrillSelection,
  type LiveSessionTrace,
  type LiveSessionStatus,
  type ReplayTerminalState
} from "@/lib/live";
import { buildVisualCoachingFeedback } from "@/lib/analysis";
import { buildAnalysisSessionFromLiveTrace } from "@/lib/live/session-compositor";
import { clearActiveDrillContext, setActiveDrillContext } from "@/lib/workflow/drill-context";
import { useAvailableDrills } from "@/lib/workflow/use-available-drills";
import { projectionInputsChanged, projectionStatsForDiagnostics, shouldRevalidatePreviewSurface, type OverlayProjectionInputs } from "@/lib/live/live-overlay-hot-path";
import type { AnalysisSessionRecord } from "@/lib/analysis";
import type { PoseTimeline } from "@/lib/upload/types";
import { AnalysisViewerShell } from "@/components/analysis-viewer/AnalysisViewerShell";
import { DrillComboboxField, DrillOriginSelectField } from "@/components/workflow-setup/DrillOriginSelector";
import { writeCompareHandoffPayload } from "@/lib/compare/compare-handoff";

const LIVE_ANALYSIS_CADENCE_FPS = 18;
const LIVE_OVERLAY_PRESENTATION_FPS = 45;
const LIVE_ANALYSIS_INTERVAL_MS = Math.round(1000 / LIVE_ANALYSIS_CADENCE_FPS);
const LIVE_PRESENTATION_INTERVAL_MS = Math.round(1000 / LIVE_OVERLAY_PRESENTATION_FPS);
const FREESTYLE_KEY = "freestyle";
const LANDMARK_SMOOTHING_ALPHA = 0.62;
const JOINT_VISIBILITY_ENTER_THRESHOLD = 0.52;
const JOINT_VISIBILITY_EXIT_THRESHOLD = 0.42;
const JOINT_VISIBILITY_GRACE_SAMPLES = 2;
const LIVE_POSE_STALE_HOLD_MS = 420;
const LIVE_POSE_STALE_WARNING_MS = 1_200;
const LIVE_DIAGNOSTIC_LOG_INTERVAL_MS = 1_500;
const LIVE_PREVIEW_READINESS_CHECK_INTERVAL_MS = 220;
const LIVE_MIN_TRACE_TIMESTAMP_STEP_MS = 4;
const LIVE_SELECTED_DRILL_STORAGE_KEY = "live.selected-drill";
const LIVE_AUDIO_ENABLED_STORAGE_KEY = "liveAudioEnabled";
const LIVE_AUDIO_CUE_STYLE_STORAGE_KEY = "liveAudioCueStyle";
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
  totalDetectionDurationMs: number;
  latestDetectionDurationMs: number;
  lastDrawAtMs: number;
};

type LiveHardwareZoomState =
  | { supported: false; value: 1 }
  | { supported: true; value: number; min: number; max: number; step: number; presets: number[] };

type ActiveCameraSource = "rear-main" | "rear-ultrawide" | "rear-unknown" | "front";
type PtzAwareTrackConstraints = MediaTrackConstraints & { pan?: ConstrainDouble; tilt?: ConstrainDouble; zoom?: ConstrainDouble };
type LivePostAnalysisSnapshot = {
  traceId: string;
  durationMs: number;
  width: number;
  height: number;
  processingSummary: {
    schemaVersion: "live-analysis-v1";
    averageConfidence: number;
    sampledFrameCount: number;
    durationMs: number;
  };
  poseTimeline: PoseTimeline;
  summary: ReturnType<typeof buildLiveResultsSummary>;
  timelineMarkers: ReturnType<typeof mapLiveTraceToTimelineMarkers>;
  cameraView?: LiveDrillSelection["cameraView"];
};

type LiveWorkspacePhase = "idle" | "live" | "processing" | "ready";
type LiveCockpitHudState = {
  phaseId: string | null;
  phaseLabel: string | null;
  repCount: number;
  holdElapsedMs: number;
};

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
  return buildRuntimePhaseLabelMap(drill);
}

function formatLiveSeconds(milliseconds: number): string {
  return `${(Math.max(0, milliseconds) / 1000).toFixed(1)}s`;
}

function phaseDisplayLabel(phase: NonNullable<LiveDrillSelection["drill"]>["phases"][number]): string {
  return (phase.name || phase.title || "").trim() || `Phase ${phase.order}`;
}

function buildCoachingCue(phaseLabel: string | null): string {
  if (!phaseLabel) {
    return "Follow the current phase and keep control.";
  }
  const normalized = phaseLabel.toLowerCase();
  if (normalized.includes("down") || normalized.includes("lower")) return "Control the descent and stay balanced.";
  if (normalized.includes("up") || normalized.includes("rise")) return "Drive up with control and keep posture tall.";
  if (normalized.includes("hold")) return "Hold steady and keep your form locked in.";
  if (normalized.includes("rest")) return "Reset your stance and breathe for the next effort.";
  return "Follow the current phase and keep control.";
}

function triggerDownload(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, fileName);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatActiveCameraSource(source: ActiveCameraSource): string {
  if (source === "rear-main") return "main rear camera";
  if (source === "rear-ultrawide") return "ultrawide rear camera";
  if (source === "front") return "front camera";
  return "rear camera";
}

function buildLivePoseTimeline(trace: LiveSessionTrace): PoseTimeline {
  return {
    schemaVersion: "upload-video-v1",
    detector: "mediapipe-pose-landmarker",
    cadenceFps: trace.cadenceFps,
    video: {
      fileName: `${trace.traceId}.webm`,
      width: trace.video.width,
      height: trace.video.height,
      durationMs: trace.video.durationMs,
      sizeBytes: trace.video.sizeBytes,
      mimeType: trace.video.mimeType
    },
    frames: trace.captures.map((capture) => capture.frame),
    generatedAtIso: trace.completedAtIso
  };
}


export function LiveStreamingWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { session, isConfigured } = useAuth();
  const [status, setStatus] = useState<LiveSessionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReferencePanelVisible, setIsReferencePanelVisible] = useState(true);
  const [isRearCamera, setIsRearCamera] = useState(true);
  const [postAnalysisSnapshot, setPostAnalysisSnapshot] = useState<LivePostAnalysisSnapshot | null>(null);
  const [liveAnalysisSession, setLiveAnalysisSession] = useState<AnalysisSessionRecord | null>(null);
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
  const [replayTimestampMs, setReplayTimestampMs] = useState(0);
  const [annotatedReplayFailureMessage, setAnnotatedReplayFailureMessage] = useState<string | null>(null);
  const [annotatedReplayFailureDetails, setAnnotatedReplayFailureDetails] = useState<string | null>(null);
  const [framingWarning, setFramingWarning] = useState<string | null>(null);
  const [previewAspectRatio, setPreviewAspectRatio] = useState<number>(16 / 9);
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);
  const [isFullscreenSupported, setIsFullscreenSupported] = useState(false);
  const [liveHardwareZoom, setLiveHardwareZoom] = useState<LiveHardwareZoomState>({ supported: false, value: 1 });
  const [cameraDescriptors, setCameraDescriptors] = useState<VideoInputDescriptor[]>([]);
  const [activeCameraSource, setActiveCameraSource] = useState<ActiveCameraSource>("rear-main");
  const [zoomStatusMessage, setZoomStatusMessage] = useState<string | null>(null);
  const [selectedZoomPreset, setSelectedZoomPreset] = useState<number>(1);
  const [liveAudioEnabled, setLiveAudioEnabled] = useState(false);
  const [isLiveAudioPrimed, setIsLiveAudioPrimed] = useState(false);
  const [liveAudioCueStyle, setLiveAudioCueStyle] = useState<LiveAudioCueStyle>("beep");
  const [isLiveAudioSupported, setIsLiveAudioSupported] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isMobilePortraitViewport, setIsMobilePortraitViewport] = useState(false);
  const [isMobileCoachingCueVisible, setIsMobileCoachingCueVisible] = useState(false);
  const [isMobileControlsTrayExpanded, setIsMobileControlsTrayExpanded] = useState(false);
  const [attemptSaveState, setAttemptSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [, setHasLiveCueEventOccurred] = useState(false);
  const mobileControlsTrayId = useId();
  const [liveHudState, setLiveHudState] = useState<LiveCockpitHudState>({
    phaseId: null,
    phaseLabel: null,
    repCount: 0,
    holdElapsedMs: 0
  });
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
  const sessionActiveRef = useRef(false);
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
  const overlayProjectionInputsRef = useRef<OverlayProjectionInputs | null>(null);
  const centerOfGravityTrackerRef = useRef(createCenterOfGravityTracker());
  const lastOverlayDiagnosticsAtRef = useRef(0);
  const lastPreviewReadyCheckAtRef = useRef(0);
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
  const mainRearDeviceIdRef = useRef<string | null>(null);
  const audioCueControllerRef = useRef<ReturnType<typeof createLiveAudioCueController> | null>(null);
  const savedAttemptTraceIdsRef = useRef<Set<string>>(new Set());
  const lastAnnouncedRepRef = useRef(0);
  const holdActiveRef = useRef(false);
  const holdTargetReachedRef = useRef(false);
  const lastCockpitHudUpdateAtRef = useRef(0);
  const liveCadenceStatsRef = useRef<LiveCadenceStats>({
    renderFrames: 0,
    analysisTicks: 0,
    detectionInvocations: 0,
    detectionSuccesses: 0,
    landmarkUpdates: 0,
    presentationTicks: 0,
    stalePoseReuseCount: 0,
    totalDetectionDurationMs: 0,
    latestDetectionDurationMs: 0,
    lastDrawAtMs: 0
  });

  const selectedDrill = useMemo(
    () => (selectedKey === FREESTYLE_KEY ? null : drillOptions.find((option) => option.key === selectedKey) ?? null),
    [drillOptions, selectedKey]
  );

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
  const authoredPhases = useMemo(
    () => [...(selection.drill?.phases ?? [])].sort((a, b) => a.order - b.order),
    [selection.drill?.phases]
  );
  const livePhaseIndex = useMemo(
    () => authoredPhases.findIndex((phase) => phase.phaseId === liveHudState.phaseId),
    [authoredPhases, liveHudState.phaseId]
  );
  const livePhaseDisplayLabel = useMemo(() => {
    const matched = authoredPhases.find((phase) => phase.phaseId === liveHudState.phaseId);
    if (matched) {
      return phaseDisplayLabel(matched);
    }
    if (liveHudState.phaseLabel && !liveHudState.phaseLabel.startsWith("phase_")) {
      return liveHudState.phaseLabel;
    }
    return null;
  }, [authoredPhases, liveHudState.phaseId, liveHudState.phaseLabel]);
  const liveCoachingCue = useMemo(() => buildCoachingCue(livePhaseDisplayLabel), [livePhaseDisplayLabel]);
  const hasSelectedDrill = selection.mode === "drill";
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

  const summary = useMemo(() => postAnalysisSnapshot?.summary ?? null, [postAnalysisSnapshot]);
  const liveTrace = postAnalysisSnapshot;
  const timelineMarkers = useMemo(() => postAnalysisSnapshot?.timelineMarkers ?? [], [postAnalysisSnapshot]);
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
  const annotatedDownloadLabel = resolveUploadDownloadLabel({ kind: "annotated", downloadable: replayDownloadSafety.annotated?.downloadable });
  const rawDownloadLabel = resolveUploadDownloadLabel({ kind: "raw", downloadable: replayDownloadSafety.raw?.downloadable });
  const downloadTargets = resolveResultDownloadTargets({
    resultType: "live",
    hasAnnotatedVideo: Boolean(annotatedReplayBlob && annotatedReplayUrl),
    hasRawVideo: Boolean(rawReplayBlob && rawReplayUrl),
    hasProcessingSummary: Boolean(postAnalysisSnapshot?.processingSummary),
    hasPoseTimeline: Boolean(postAnalysisSnapshot?.poseTimeline)
  });
  const replayUrl = replayPreviewSelection.source?.url ?? null;
  const replayMimeType = replayPreviewSelection.source?.mimeType ?? null;
  const trackingStatusLabel = trackingStatusRef.current;
  const workspacePhase: LiveWorkspacePhase = useMemo(() => {
    if (status === "live-session-running" || status === "requesting-permission") {
      return "live";
    }
    if (status === "stopping-finalizing" || replayState === "export-in-progress") {
      return "processing";
    }
    if (status === "completed" && postAnalysisSnapshot) {
      return "ready";
    }
    return "idle";
  }, [postAnalysisSnapshot, replayState, status]);
  const isLivePhase = workspacePhase === "live";
  const isPostAnalysisPhase = workspacePhase === "processing" || workspacePhase === "ready";
  const isSessionStageActive = isLivePhase;
  const shouldShowSessionToolbar = isLivePhase || isStageFullscreen;
  const shouldShowCoachingCueCard = !isMobileViewport || isMobileCoachingCueVisible;
  const activeZoomPreset = resolveSelectedZoomPreset(selectedZoomPreset, APP_HARDWARE_ZOOM_PRESETS);
  const halfXAccess = useMemo(() => {
    if (activeCameraSource === "rear-ultrawide") {
      return { available: true, reason: "switchable-ultrawide" as const };
    }
    const activeTrack = activeVideoTrackRef.current;
    const activeSettings = activeTrack?.getSettings?.();
    return resolveHalfXAccessDecision(cameraDescriptors, {
      deviceId: activeSettings?.deviceId,
      facing: isRearCamera ? "rear" : "front",
      zoomSupport: liveHardwareZoom.supported ? { ...liveHardwareZoom, current: liveHardwareZoom.value } : { supported: false }
    });
  }, [activeCameraSource, cameraDescriptors, isRearCamera, liveHardwareZoom]);
  const canAttemptHalfXFallbackProbe = useMemo(() => {
    if (halfXAccess.available || !isRearCamera) {
      return false;
    }
    const activeTrack = activeVideoTrackRef.current;
    const currentDeviceId = activeTrack?.getSettings?.().deviceId;
    const alternateRearCount = cameraDescriptors.filter(
      (descriptor) => descriptor.facing === "rear" && descriptor.deviceId !== currentDeviceId && descriptor.rearLensHint !== "telephoto"
    ).length;
    return alternateRearCount > 1;
  }, [cameraDescriptors, halfXAccess.available, isRearCamera]);
  const zoomHelperText = useMemo(() => {
    if (status !== "live-session-running") {
      return null;
    }
    if (canAttemptHalfXFallbackProbe) {
      return "Tap 0.5x to probe alternate rear cameras for ultrawide access";
    }
    if (!halfXAccess.available) {
      return "0.5x ultrawide lens not accessible from this browser session";
    }
    return zoomStatusMessage;
  }, [canAttemptHalfXFallbackProbe, halfXAccess.available, status, zoomStatusMessage]);
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
  const benchmarkFeedback = useMemo(
    () => liveAnalysisSession?.status === "completed" && liveAnalysisSession.benchmarkComparison
      ? buildBenchmarkCoachingFeedback({ comparison: liveAnalysisSession.benchmarkComparison })
      : null,
    [liveAnalysisSession]
  );
  const replayAnalysisState = useMemo(
    () =>
      buildReplayAnalysisState({
        session: liveAnalysisSession,
        phaseLabelsById: phaseLabelMap,
        timestampMs: replayTimestampMs
      }),
    [liveAnalysisSession, phaseLabelMap, replayTimestampMs]
  );
  const coachingFeedback = useMemo(
    () => {
      const hasReplayAnalysis = Boolean(liveAnalysisSession && replayUrl);
      if (!hasReplayAnalysis || liveAnalysisSession?.status !== "completed") {
        return null;
      }
      return buildVisualCoachingFeedback({
        session: liveAnalysisSession,
        benchmarkFeedback,
        drill: selection.drill,
        replayState: replayAnalysisState,
        frame: getNearestPoseFrame(postAnalysisSnapshot?.poseTimeline.frames ?? [], replayTimestampMs),
        timestampMs: replayTimestampMs
      });
    },
    [benchmarkFeedback, liveAnalysisSession, postAnalysisSnapshot?.poseTimeline.frames, replayAnalysisState, replayTimestampMs, replayUrl, selection.drill]
  );
  const canOpenCompare = Boolean(
    liveAnalysisSession
      && selection.drill
      && (
        (selection.drill.benchmark && selection.drill.benchmark.sourceType !== "none")
        || liveAnalysisSession.benchmarkComparison
      )
  );

  useEffect(() => {
    setReplayTimestampMs(0);
  }, [replayUrl, completedPreviewSurface, postAnalysisSnapshot?.traceId]);

  useEffect(() => {
    const video = replayVideoRef.current;
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
  }, [replayUrl, completedPreviewSurface]);

  const liveViewerModel = useMemo(
    () =>
      mapLiveAnalysisToViewerModel({
        replayState,
        replayStageLabel: replayExportStageLabel,
        videoUrl: replayUrl,
        surface: completedPreviewSurface,
        markers: timelineMarkers,
        durationMs: liveTrace?.durationMs ?? 0,
        mediaAspectRatio: liveTrace?.width && liveTrace?.height ? liveTrace.width / liveTrace.height : undefined,
        hasAnnotatedReady: Boolean(annotatedReplayUrl),
        panel: buildAnalysisPanelModel(buildAnalysisDomainModel({
          drillLabel: summary?.drillLabel ?? "Live Streaming",
          movementType: selection.mode === "drill" ? (selection.drill?.drillType === "hold" ? "hold" : "rep") : "freestyle",
          repCount: replayAnalysisState.repCount,
          holdDurationMs: replayAnalysisState.currentHoldMsAtPlayhead > 0
            ? replayAnalysisState.currentHoldMsAtPlayhead
            : replayAnalysisState.detectedHoldMs,
          durationMs: liveTrace?.durationMs ?? 0,
          confidence: liveAnalysisSession?.summary.confidenceAvg,
          events: liveAnalysisSession?.events ?? [],
          phaseLabelsById: phaseLabelMap,
          phaseIdsInOrder: selection.drill?.phases.map((phase) => phase.phaseId) ?? [],
          mode: "timestamp",
          currentTimestampMs: replayTimestampMs,
          feedbackLines: benchmarkFeedback
            ? [benchmarkFeedback.summary.label, benchmarkFeedback.topFindings[0]?.description ?? benchmarkFeedback.summary.description]
            : trackingStatusLabel ? [trackingStatusLabel, "Coach notes not available yet"] : undefined,
          summaryMetrics: liveAnalysisSession?.benchmarkComparison
            ? [
                { id: "benchmark_status", label: "Benchmark", value: benchmarkFeedback?.summary.label ?? liveAnalysisSession.benchmarkComparison.status },
                {
                  id: "phase_match",
                  label: "Phase sequence",
                  value: liveAnalysisSession.benchmarkComparison.phaseMatch.matched
                    ? "Phase sequence matched."
                    : formatPhaseSequenceSummary(liveAnalysisSession.benchmarkComparison)
                },
                {
                  id: "timing_match",
                  label: "Timing",
                  value: liveAnalysisSession.benchmarkComparison.timing.present
                    ? (liveAnalysisSession.benchmarkComparison.timing.matched ? "Timing matched." : "Timing mismatch.")
                    : "Unavailable"
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
          coachingFeedback: liveAnalysisSession?.status === "completed" && replayUrl ? coachingFeedback ?? undefined : undefined,
          phaseTimelineInteractive: true
        })),
        primarySummaryChips: [
          { id: "drill", label: "Drill", value: summary?.drillLabel ?? "Freestyle" },
          { id: "duration", label: "Duration", value: summary?.durationLabel ?? "0s" },
          ...(selection.drill?.drillType === "hold"
            ? []
            : [{ id: "reps", label: "Completed reps so far", value: String(replayAnalysisState.repCount) }]),
          ...(selection.drill?.drillType === "hold"
            ? [
                {
                  id: "hold_current",
                  label: "Current hold",
                  value: replayAnalysisState.currentHoldMsAtPlayhead > 0 ? formatDurationShort(replayAnalysisState.currentHoldMsAtPlayhead) : "Not active"
                },
                {
                  id: "hold_best",
                  label: "Best hold",
                  value: replayAnalysisState.maxHoldMs > 0 ? formatDurationShort(replayAnalysisState.maxHoldMs) : "None"
                },
                {
                  id: "hold_total",
                  label: "Total hold time",
                  value: replayAnalysisState.detectedHoldMs > 0 ? formatDurationShort(replayAnalysisState.detectedHoldMs) : "0s"
                },
                {
                  id: "hold_count",
                  label: "Completed holds",
                  value: String(replayAnalysisState.holdCount)
                }
              ]
            : [{
                id: "holds",
                label: "Current hold",
                value: replayAnalysisState.currentHoldMsAtPlayhead > 0 ? formatDurationShort(replayAnalysisState.currentHoldMsAtPlayhead) : "Not active"
              }]),
          { id: "phase", label: "Current phase", value: replayAnalysisState.currentPhaseLabel }
        ],
        technicalStatusChips: [
          { id: "camera_source", label: "Camera source", value: formatActiveCameraSource(activeCameraSource) },
          ...(selection.cameraView ? [{ id: "camera_view", label: "Camera view", value: formatCameraViewLabel(selection.cameraView) }] : []),
          { id: "tracking", label: "Tracking", value: trackingStatusLabel }
        ],
        downloads: [
          ...(downloadTargets.includes("annotated") && annotatedReplayUrl
            ? [{
                id: "download_annotated",
                label: annotatedDownloadLabel,
                onDownload: () => triggerDownload(annotatedReplayUrl, `${postAnalysisSnapshot?.traceId ?? "live-session"}-annotated.${extensionFromMimeType(annotatedReplayMimeType)}`),
                hint: replayDownloadSafety.annotated?.warning ?? undefined
              }]
            : []),
          ...(downloadTargets.includes("raw") && rawReplayUrl
            ? [{
                id: "download_raw",
                label: rawDownloadLabel,
                onDownload: () => triggerDownload(rawReplayUrl, `${postAnalysisSnapshot?.traceId ?? "live-session"}-raw.${extensionFromMimeType(rawReplayMimeType)}`),
                hint: replayDownloadSafety.raw?.warning ?? undefined
              }]
            : []),
          ...(downloadTargets.includes("processing_summary") && postAnalysisSnapshot?.processingSummary
            ? [{
                id: "processing_summary",
                label: "Download Processing Summary (.json)",
                onDownload: () =>
                  downloadBlob(
                    new Blob([JSON.stringify(postAnalysisSnapshot.processingSummary, null, 2)], { type: "application/json" }),
                    `${postAnalysisSnapshot.traceId}.processing-summary.json`
                  )
              }]
            : []),
          ...(downloadTargets.includes("pose_timeline") && postAnalysisSnapshot?.poseTimeline
            ? [{
                id: "pose_timeline",
                label: "Download Pose Timeline (.json)",
                onDownload: () =>
                  downloadBlob(
                    new Blob([JSON.stringify(postAnalysisSnapshot.poseTimeline, null, 2)], { type: "application/json" }),
                    `${postAnalysisSnapshot.traceId}.pose-timeline.json`
                  )
              }]
            : [])
        ],
        diagnosticsSections:
          liveAnalysisSession
            ? [{
                id: "events",
                title: "Events",
                content: liveAnalysisSession.events.slice(0, 24).map((event) => `${event.type} @ ${Math.round(event.timestampMs)}ms`)
              }]
            : [],
        warnings: [annotatedReplayFailureMessage, replayPreviewSelection.warning, replayUnavailableMessage, replayDownloadSafety.annotated?.warning, replayDownloadSafety.raw?.warning].filter(
          (value): value is string => Boolean(value)
        ),
        recommendedDeliveryLabel: preferredReplayDeliverySource ? `Recommended delivery: ${preferredReplayDeliverySource.id === "annotated" ? "Annotated" : "Raw"}` : undefined
      }),
    [
      replayState,
      replayExportStageLabel,
      replayUrl,
      completedPreviewSurface,
      timelineMarkers,
      liveTrace,
      annotatedReplayUrl,
      summary,
      phaseLabelMap,
      activeCameraSource,
      selection.mode,
      selection.drill?.drillType,
      selection.drill?.phases,
      selection.cameraView,
      benchmarkFeedback,
      coachingFeedback,
      replayAnalysisState.currentPhaseLabel,
      replayAnalysisState.currentHoldMsAtPlayhead,
      replayAnalysisState.detectedHoldMs,
      replayAnalysisState.maxHoldMs,
      replayAnalysisState.holdCount,
      replayAnalysisState.repCount,
      replayTimestampMs,
      trackingStatusLabel,
      downloadTargets,
      annotatedDownloadLabel,
      postAnalysisSnapshot,
      annotatedReplayMimeType,
      replayDownloadSafety.annotated?.warning,
      rawReplayUrl,
      rawDownloadLabel,
      rawReplayMimeType,
      replayDownloadSafety.raw?.warning,
      liveAnalysisSession,
      annotatedReplayFailureMessage,
      replayPreviewSelection.warning,
      replayUnavailableMessage,
      preferredReplayDeliverySource
    ]
  );
  useEffect(() => {
    if (!postAnalysisSnapshot) {
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
  }, [activeReplaySurface, annotatedReplayBlob, annotatedReplayMimeType, annotatedReplayUrl, postAnalysisSnapshot, rawReplayBlob, rawReplayMimeType, rawReplayUrl, replayDownloadSafety.annotated?.downloadable, replayDownloadSafety.raw?.downloadable, replayMimeType, replayPreviewSelection.blockedByCompatibility, replayPreviewSelection.source, replayPreviewSelection.warning]);

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
    overlayProjectionInputsRef.current = null;
    lastPreviewReadyCheckAtRef.current = 0;
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
    setIsLiveAudioSupported(canUseLiveAudioCues());
    const storedEnabled = window.localStorage.getItem(LIVE_AUDIO_ENABLED_STORAGE_KEY);
    const storedStyle = window.localStorage.getItem(LIVE_AUDIO_CUE_STYLE_STORAGE_KEY);
    setLiveAudioEnabled(storedEnabled === "true");
    setIsLiveAudioPrimed(false);
    if (storedStyle === "beep" || storedStyle === "chime" || storedStyle === "voice-count" || storedStyle === "silent") {
      setLiveAudioCueStyle(storedStyle);
    }
    audioCueControllerRef.current = createLiveAudioCueController();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mobileViewportQuery = window.matchMedia("(max-width: 980px)");
    const mobilePortraitQuery = window.matchMedia("(max-width: 980px) and (orientation: portrait)");
    const syncMobileLayoutState = (matchesMobile: boolean) => {
      setIsMobileViewport(matchesMobile);
      setIsMobileCoachingCueVisible(!matchesMobile);
    };
    const syncMobilePortraitState = (matchesMobilePortrait: boolean) => {
      setIsMobilePortraitViewport(matchesMobilePortrait);
      if (!matchesMobilePortrait) {
        setIsMobileControlsTrayExpanded(false);
      }
    };
    syncMobileLayoutState(mobileViewportQuery.matches);
    syncMobilePortraitState(mobilePortraitQuery.matches);
    const onMobileViewportChange = (event: MediaQueryListEvent) => {
      syncMobileLayoutState(event.matches);
    };
    const onMobilePortraitChange = (event: MediaQueryListEvent) => {
      syncMobilePortraitState(event.matches);
    };
    mobileViewportQuery.addEventListener("change", onMobileViewportChange);
    mobilePortraitQuery.addEventListener("change", onMobilePortraitChange);
    return () => {
      mobileViewportQuery.removeEventListener("change", onMobileViewportChange);
      mobilePortraitQuery.removeEventListener("change", onMobilePortraitChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LIVE_AUDIO_ENABLED_STORAGE_KEY, String(liveAudioEnabled));
  }, [liveAudioEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LIVE_AUDIO_CUE_STYLE_STORAGE_KEY, liveAudioCueStyle);
  }, [liveAudioCueStyle]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (getCameraSupportStatus(window) === "unsupported") {
      setStatus("unsupported");
      setErrorMessage("Live Streaming is unsupported in this browser. Use a browser with camera + MediaRecorder support.");
    }
  }, [updateFramingWarning, updateTrackingStatus]);

  useEffect(() => {
    lastAnnouncedRepRef.current = 0;
    holdActiveRef.current = false;
    holdTargetReachedRef.current = false;
    setHasLiveCueEventOccurred(false);
    setLiveHudState({ phaseId: null, phaseLabel: null, repCount: 0, holdElapsedMs: 0 });
  }, [selectedKey]);

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

  const stopLiveRenderLoop = useCallback(() => {
    if (liveLoopRef.current) {
      cancelAnimationFrame(liveLoopRef.current);
      liveLoopRef.current = null;
    }
  }, []);

  const clearLiveOverlayCanvas = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const cleanupSession = useCallback(async (options?: { stopRecorder?: boolean; discardRecording?: boolean; nextStatus?: LiveSessionStatus }) => {
    sessionActiveRef.current = false;
    stopLiveRenderLoop();
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
    mainRearDeviceIdRef.current = null;
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
    lastAnnouncedRepRef.current = 0;
    holdActiveRef.current = false;
    holdTargetReachedRef.current = false;
    lastCockpitHudUpdateAtRef.current = 0;
    setLiveHudState({ phaseId: null, phaseLabel: null, repCount: 0, holdElapsedMs: 0 });
    liveCadenceStatsRef.current = {
      renderFrames: 0,
      analysisTicks: 0,
      detectionInvocations: 0,
      detectionSuccesses: 0,
      landmarkUpdates: 0,
      presentationTicks: 0,
      stalePoseReuseCount: 0,
      totalDetectionDurationMs: 0,
      latestDetectionDurationMs: 0,
      lastDrawAtMs: 0
    };
    jointVisibleRef.current = {};
    jointGraceSamplesRef.current = {};
    clearLiveOverlayCanvas();
    if (options?.nextStatus) {
      setStatus(options.nextStatus);
    }
    setSelectedZoomPreset(1);
    setZoomStatusMessage(null);
    updateTrackingStatus("Tracking ready");
    updateFramingWarning(null);
  }, [clearLiveOverlayCanvas, exitStageFullscreenIfNeeded, stopLiveRenderLoop, updateFramingWarning, updateTrackingStatus]);

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
      const containerBounds = container.getBoundingClientRect();
      const videoBounds = video.getBoundingClientRect();
      const objectFit = typeof window === "undefined" ? "contain" : window.getComputedStyle(video).objectFit;
      const fitMode = objectFit === "cover" ? "cover" : "contain";
      const nextProjectionInputs: OverlayProjectionInputs = {
        sourceWidth: video.videoWidth,
        sourceHeight: video.videoHeight,
        containerLeft: containerBounds.left,
        containerTop: containerBounds.top,
        containerWidth: containerBounds.width,
        containerHeight: containerBounds.height,
        videoLeft: videoBounds.left,
        videoTop: videoBounds.top,
        videoWidth: videoBounds.width,
        videoHeight: videoBounds.height,
        fitMode,
        mirrored: !isRearCamera
      };
      if (projectionInputsChanged(overlayProjectionInputsRef.current, nextProjectionInputs)) {
        overlayProjectionRef.current = createOverlayProjectionFromLayout({
          sourceWidth: nextProjectionInputs.sourceWidth,
          sourceHeight: nextProjectionInputs.sourceHeight,
          containerRect: {
            left: nextProjectionInputs.containerLeft,
            top: nextProjectionInputs.containerTop,
            width: nextProjectionInputs.containerWidth,
            height: nextProjectionInputs.containerHeight
          },
          videoRect: {
            left: nextProjectionInputs.videoLeft,
            top: nextProjectionInputs.videoTop,
            width: nextProjectionInputs.videoWidth,
            height: nextProjectionInputs.videoHeight
          },
          fitMode: nextProjectionInputs.fitMode,
          mirrored: nextProjectionInputs.mirrored
        });
        overlayProjectionInputsRef.current = nextProjectionInputs;
      }
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
  }, [cleanupSession, phaseLabelMap, selection.cameraView]);

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
    centerOfGravityTrackerRef.current.reset();
    setStatus("requesting-permission");
    setIsReferencePanelVisible(false);
    setReplayState("idle");
    setReplayExportStageLabel(null);
    setShowRawDuringProcessing(false);
    setCompletedPreviewSurface("raw");
    setAnnotatedReplayFailureMessage(null);
    setAnnotatedReplayMimeType(null);
    setAnnotatedReplayFailureDetails(null);
    setPostAnalysisSnapshot(null);
    setLiveAnalysisSession(null);
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
    setZoomStatusMessage(null);

    let stream: MediaStream;
    try {
      const startupVideoConstraints: PtzAwareTrackConstraints = {
        facingMode: isRearCamera ? { ideal: "environment" } : { ideal: "user" },
        // PTZ hints are optional; browsers that do not expose PTZ will ignore these.
        pan: { ideal: 0 },
        tilt: { ideal: 0 },
        zoom: { ideal: 1 }
      };
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...startupVideoConstraints
        },
        audio: false
      });
      const activeVideoTrack = stream.getVideoTracks()[0] ?? null;
      activeVideoTrackRef.current = activeVideoTrack;
      const activeTrackSettings = activeVideoTrack?.getSettings?.();
      console.info("[live-camera] SUPPORTED_CONSTRAINTS", navigator.mediaDevices.getSupportedConstraints());
      const descriptors = await buildVideoInputDescriptors({
        // Keep startup to one active stream: we do not open probe streams here.
        probeDevice: async () => ({ zoomSupport: { supported: false }, facing: "unknown" })
      });
      setCameraDescriptors(descriptors);
      console.info("[live-camera] ENUMERATE_DEVICES_SUMMARY", {
        videoInputCount: descriptors.length,
        descriptors: descriptors.map((descriptor) => ({
          deviceId: descriptor.deviceId,
          label: descriptor.label,
          facing: descriptor.facing,
          rearLensHint: descriptor.rearLensHint,
          zoom: descriptor.zoomSupport.supported
            ? { min: descriptor.zoomSupport.min, max: descriptor.zoomSupport.max, step: descriptor.zoomSupport.step }
            : null
        }))
      });
      const rearDescriptors = descriptors.filter((descriptor) => descriptor.facing === "rear");
      const rearMainCandidates = rearDescriptors.filter((descriptor) => descriptor.rearLensHint === "main");
      const rearUltrawideCandidates = rearDescriptors.filter((descriptor) => descriptor.rearLensHint === "ultrawide");
      const rearAlternateCandidates = rearDescriptors.filter((descriptor) => descriptor.rearLensHint !== "telephoto");
      console.info("[live-camera] REAR_CAMERA_CANDIDATES", {
        rearCameraCount: rearDescriptors.length,
        mainRearCandidates: rearMainCandidates.map((descriptor) => ({ deviceId: descriptor.deviceId, label: descriptor.label })),
        ultrawideRearCandidates: rearUltrawideCandidates.map((descriptor) => ({ deviceId: descriptor.deviceId, label: descriptor.label })),
        alternateRearCandidates: rearAlternateCandidates.map((descriptor) => ({
          deviceId: descriptor.deviceId,
          label: descriptor.label,
          rearLensHint: descriptor.rearLensHint
        })),
        noUltrawideReason: rearUltrawideCandidates.length === 0 ? "no_ultrawide_labeled_rear_camera_using_alternate_rear_fallback" : null
      });
      const zoomSupport = getHardwareZoomSupport(activeVideoTrack);
      console.info("[live-camera] ACTIVE_TRACK_ZOOM_CAPABILITIES", {
        deviceId: activeTrackSettings?.deviceId ?? "unknown",
        label: descriptors.find((descriptor) => descriptor.deviceId === activeTrackSettings?.deviceId)?.label ?? "unknown",
        zoom: zoomSupport.supported ? { min: zoomSupport.min, max: zoomSupport.max, step: zoomSupport.step } : null
      });
      console.info("[live-camera] ACTIVE_TRACK_ZOOM_SETTINGS", {
        zoom: (activeVideoTrack?.getSettings?.() as MediaTrackSettings & { zoom?: number } | undefined)?.zoom ?? null
      });
      if (zoomSupport.supported) {
        const availablePresets = getSupportedZoomPresets(zoomSupport, APP_HARDWARE_ZOOM_PRESETS);
        if (availablePresets.length > 0) {
          const defaultZoom = availablePresets.includes(1) ? 1 : selectedZoomRef.current;
          const clampedRequestedZoom = Math.min(zoomSupport.max, Math.max(zoomSupport.min, defaultZoom));
          const appliedZoom = await applyHardwareZoomPreset(activeVideoTrack, clampedRequestedZoom, zoomSupport);
          selectedZoomRef.current = appliedZoom;
          setSelectedZoomPreset(selectedZoomRef.current);
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
          setSelectedZoomPreset(selectedZoomRef.current);
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
        setSelectedZoomPreset(selectedZoomRef.current);
        setLiveHardwareZoom({ supported: false, value: 1 });
        console.info("[live-overlay] hardware-zoom unsupported", {
          facingMode: isRearCamera ? "rear" : "front"
        });
      }
      liveStreamRef.current = stream;
      const activeDeviceId = activeTrackSettings?.deviceId;
      const activeDescriptor = descriptors.find((descriptor) => descriptor.deviceId === activeDeviceId);
      const resolvedSource = isRearCamera ? (activeDescriptor?.rearLensHint === "ultrawide" ? "rear-ultrawide" : "rear-main") : "front";
      if (resolvedSource === "rear-main" && activeDeviceId) {
        mainRearDeviceIdRef.current = activeDeviceId;
      }
      setActiveCameraSource(resolvedSource);
      console.info("[live-camera] ACTIVE_CAMERA_SELECTED", {
        deviceId: activeDeviceId ?? "unknown",
        label: activeDescriptor?.label ?? "unknown",
        source: resolvedSource
      });
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
    sessionActiveRef.current = true;

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
      if (!sessionActiveRef.current) {
        return;
      }
      if (!previewVideoRef.current || !landmarkerRef.current || !traceRef.current) {
        return;
      }

      const elapsedMs = performance.now() - startedAtRef.current;
      liveCadenceStatsRef.current.renderFrames += 1;
      liveCadenceStatsRef.current.lastDrawAtMs = performance.now();
      const previewVideo = previewVideoRef.current;
      syncOverlayCanvasSize();
      const projection = overlayProjectionRef.current;
      if (!previewVideo || !projection) {
        if (sessionActiveRef.current) {
          liveLoopRef.current = requestAnimationFrame(draw);
        }
        return;
      }
      const mediaTimeMs = Math.max(mediaStartMsRef.current, previewVideo.currentTime * 1000);
      const elapsedTraceTimestampMs = Math.max(0, Math.round(elapsedMs));
      const mediaTraceTimestampMs = Math.max(0, Math.round(mediaTimeMs - mediaStartMsRef.current));
      const traceTimestampMs = Math.max(lastPoseFrameAtRef.current + LIVE_MIN_TRACE_TIMESTAMP_STEP_MS, Math.max(mediaTraceTimestampMs, elapsedTraceTimestampMs));
      const pixelRatio = overlayPixelRatioRef.current;
      const shouldCheckPreviewReadiness = shouldRevalidatePreviewSurface({
        nowMs: performance.now(),
        lastCheckAtMs: lastPreviewReadyCheckAtRef.current,
        intervalMs: LIVE_PREVIEW_READINESS_CHECK_INTERVAL_MS,
        needsResizeSync: overlayNeedsResizeSyncRef.current
      });
      if (shouldCheckPreviewReadiness) {
        lastPreviewReadyCheckAtRef.current = performance.now();
        const liveContainerBounds = mediaContainerRef.current?.getBoundingClientRect();
        const liveContainerSize = resolvePreviewContainerSize({
          cachedWidth: containerSizeRef.current.width,
          cachedHeight: containerSizeRef.current.height,
          measuredWidth: liveContainerBounds?.width,
          measuredHeight: liveContainerBounds?.height
        });
        if (
          !isPreviewSurfaceReady({
            readyState: previewVideo.readyState,
            videoWidth: previewVideo.videoWidth,
            videoHeight: previewVideo.videoHeight,
            containerWidth: Math.round(liveContainerSize.width),
            containerHeight: Math.round(liveContainerSize.height),
            canvasWidth: canvas.width,
            canvasHeight: canvas.height
          })
        ) {
          logOverlayDiagnostics("draw-skipped-preview-not-ready");
          if (sessionActiveRef.current) {
            liveLoopRef.current = requestAnimationFrame(draw);
          }
          return;
        }
      }

      if (elapsedMs >= nextAnalysisAtMs) {
        const detectionStartAtMs = performance.now();
        let detectionTimestampMs = Math.max(lastDetectionTimestampRef.current + 1, Math.round(mediaTimeMs));
        if (Math.round(mediaTimeMs) === lastVideoTimeMsRef.current) {
          repeatedVideoTimestampCountRef.current += 1;
          detectionTimestampMs = Math.max(detectionTimestampMs, Math.round(performance.now()));
        } else {
          repeatedVideoTimestampCountRef.current = 0;
          lastVideoTimeMsRef.current = Math.round(mediaTimeMs);
        }
        const result = landmarkerRef.current.detectForVideo(previewVideo, detectionTimestampMs);
        const detectionDurationMs = performance.now() - detectionStartAtMs;
        lastDetectionTimestampRef.current = detectionTimestampMs;
        const landmarks = result.landmarks?.[0];
        liveCadenceStatsRef.current.analysisTicks += 1;
        liveCadenceStatsRef.current.detectionInvocations += 1;
        liveCadenceStatsRef.current.latestDetectionDurationMs = detectionDurationMs;
        liveCadenceStatsRef.current.totalDetectionDurationMs += detectionDurationMs;
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
        if (sessionActiveRef.current) {
          liveLoopRef.current = requestAnimationFrame(draw);
        }
        return;
      }

      nextPresentationAtMs = elapsedMs + LIVE_PRESENTATION_INTERVAL_MS;
      liveCadenceStatsRef.current.presentationTicks += 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const analyzedFrameState = traceRef.current.getAnalyzedFrameState(traceTimestampMs);
      if (performance.now() - lastCockpitHudUpdateAtRef.current >= LIVE_HUD_UPDATE_INTERVAL_MS) {
        setLiveHudState({
          phaseId: analyzedFrameState.overlay.activePhaseId,
          phaseLabel: analyzedFrameState.overlay.phaseLabel,
          repCount: analyzedFrameState.overlay.repCount,
          holdElapsedMs: analyzedFrameState.overlay.holdElapsedMs
        });
        lastCockpitHudUpdateAtRef.current = performance.now();
      }
      if (liveAudioEnabled && isLiveAudioPrimed) {
        const audioController = audioCueControllerRef.current;
        if (audioController) {
          if (selection.drill?.drillType === "rep") {
            if (analyzedFrameState.overlay.repCount > lastAnnouncedRepRef.current) {
              lastAnnouncedRepRef.current = analyzedFrameState.overlay.repCount;
              setHasLiveCueEventOccurred(true);
              void audioController.playRepSuccess(liveAudioCueStyle, analyzedFrameState.overlay.repCount);
            }
          } else if (selection.drill?.drillType === "hold") {
            const isHolding = analyzedFrameState.overlay.holdActive;
            const activePhase = authoredPhases.find((phase) => phase.phaseId === analyzedFrameState.overlay.activePhaseId);
            const targetHoldMs = activePhase?.analysis?.comparison?.targetHoldDurationMs ?? null;
            if (isHolding && !holdActiveRef.current) {
              holdActiveRef.current = true;
              holdTargetReachedRef.current = false;
              setHasLiveCueEventOccurred(true);
              void audioController.playHoldStart(liveAudioCueStyle);
            }
            if (isHolding && targetHoldMs && !holdTargetReachedRef.current && analyzedFrameState.overlay.holdElapsedMs >= targetHoldMs) {
              holdTargetReachedRef.current = true;
              setHasLiveCueEventOccurred(true);
              void audioController.playHoldSuccess(liveAudioCueStyle);
            }
            if (!isHolding && holdActiveRef.current) {
              if (targetHoldMs && !holdTargetReachedRef.current) {
                setHasLiveCueEventOccurred(true);
                void audioController.playHoldWarning(liveAudioCueStyle);
              }
              holdActiveRef.current = false;
              holdTargetReachedRef.current = false;
            }
          }
        }
      }
      const staleForMs = Math.max(0, traceTimestampMs - lastPoseFrameAtRef.current);
      const staleLandmarkAgeMs = Math.max(0, Math.round(performance.now() - lastAcceptedLandmarkPerfNowRef.current));
      const canReuseStalePose = lastPoseFrameAtRef.current > 0 && staleForMs <= LIVE_POSE_STALE_HOLD_MS;
      if (analyzedFrameState.poseFrame && canReuseStalePose) {
        if (staleForMs > LIVE_ANALYSIS_INTERVAL_MS) {
          liveCadenceStatsRef.current.stalePoseReuseCount += 1;
        }
        lastRenderedLandmarkTimestampRef.current = analyzedFrameState.poseFrame.timestampMs;
        drawPoseOverlay(ctx, canvas.width / pixelRatio, canvas.height / pixelRatio, analyzedFrameState.poseFrame, {
          projection,
          centerOfGravityTracker: centerOfGravityTrackerRef.current
        });
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
          repeatedVideoTimestampCount: repeatedVideoTimestampCountRef.current,
          analysisFpsEffective: Number((liveCadenceStatsRef.current.analysisTicks / Math.max(1, elapsedMs / 1000)).toFixed(1)),
          presentationFpsEffective: Number((liveCadenceStatsRef.current.presentationTicks / Math.max(1, elapsedMs / 1000)).toFixed(1)),
          detectionDurationMs: Number(liveCadenceStatsRef.current.latestDetectionDurationMs.toFixed(1)),
          detectionDurationAvgMs: Number((liveCadenceStatsRef.current.totalDetectionDurationMs / Math.max(1, liveCadenceStatsRef.current.detectionInvocations)).toFixed(1)),
          drawToPoseLatencyMs: Math.max(0, Math.round(performance.now() - lastAcceptedLandmarkPerfNowRef.current)),
          projectionSnapshot: projectionStatsForDiagnostics(projection)
        });
      }

      drawAnalysisOverlay(ctx, canvas.width / pixelRatio, canvas.height / pixelRatio, analyzedFrameState.overlay, {
        modeLabel: selection.drillBindingLabel,
        showDrillMetrics: false,
        phaseLabels: phaseLabelMap
      });

      if (sessionActiveRef.current) {
        liveLoopRef.current = requestAnimationFrame(draw);
      }
    };

    draw();
  }, [annotatedReplayUrl, authoredPhases, buildStabilizedPoseFrame, cleanupSession, isRearCamera, isLiveAudioPrimed, liveAudioCueStyle, liveAudioEnabled, logOverlayDiagnostics, phaseLabelMap, rawReplayUrl, requiredFramingJoints, selection, status, syncOverlayCanvasSize, updateFramingWarning, updateTrackingStatus]);

  const updateHardwareZoom = useCallback(
    async (presetZoom: number) => {
      const activeTrack = activeVideoTrackRef.current;
      if (!activeTrack || status !== "live-session-running") {
        return false;
      }
      const activeSupport = getHardwareZoomSupport(activeTrack);
      if (!activeSupport.supported) {
        return false;
      }
      try {
        const appliedZoom = await applyHardwareZoomPreset(activeTrack, presetZoom, { ...activeSupport, current: activeSupport.current });
        selectedZoomRef.current = appliedZoom;
        setSelectedZoomPreset(selectedZoomRef.current);
        setLiveHardwareZoom({
          supported: true,
          value: appliedZoom,
          min: activeSupport.min,
          max: activeSupport.max,
          step: activeSupport.step,
          presets: getSupportedZoomPresets(activeSupport, APP_HARDWARE_ZOOM_PRESETS)
        });
        overlayNeedsResizeSyncRef.current = true;
        syncOverlayCanvasSize(true);
        console.info("[live-overlay] hardware-zoom updated", {
          presetZoom,
          activeZoom: appliedZoom
        });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to apply hardware zoom.";
        console.warn("[live-overlay] hardware-zoom apply failed", { message });
        return false;
      }
    },
    [status, syncOverlayCanvasSize]
  );

  const switchToDevice = useCallback(
    async (deviceId: string, source: ActiveCameraSource, reason: "switch-to-ultrawide" | "restore-main-rear") => {
      const deviceVideoConstraints: PtzAwareTrackConstraints = {
        deviceId: { exact: deviceId },
        pan: { ideal: 0 },
        tilt: { ideal: 0 },
        zoom: { ideal: 1 }
      };
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { ...deviceVideoConstraints },
        audio: false
      });
      const previousStream = liveStreamRef.current;
      liveStreamRef.current = nextStream;
      activeVideoTrackRef.current = nextStream.getVideoTracks()[0] ?? null;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = nextStream;
        await previewVideoRef.current.play();
        const width = previewVideoRef.current.videoWidth;
        const height = previewVideoRef.current.videoHeight;
        if (width > 0 && height > 0) {
          setPreviewAspectRatio(width / height);
        }
      }
      await replaceStreamSafely(previousStream, nextStream, stopMediaStream);
      const switchedTrack = activeVideoTrackRef.current;
      const switchedZoomSupport = getHardwareZoomSupport(switchedTrack);
      setLiveHardwareZoom(
        switchedZoomSupport.supported
          ? {
              supported: true,
              value: switchedZoomSupport.current,
              min: switchedZoomSupport.min,
              max: switchedZoomSupport.max,
              step: switchedZoomSupport.step,
              presets: getSupportedZoomPresets(switchedZoomSupport, APP_HARDWARE_ZOOM_PRESETS)
            }
          : { supported: false, value: 1 }
      );
      setActiveCameraSource(source);
      overlayNeedsResizeSyncRef.current = true;
      syncOverlayCanvasSize(true);
      console.info("[live-camera] ACTIVE_CAMERA_SELECTED", {
        deviceId,
        source,
        reason
      });
    },
    [syncOverlayCanvasSize]
  );

  const handleZoomPresetSelection = useCallback(async (presetZoom: number) => {
    if (status !== "live-session-running") {
      return;
    }

    if (presetZoom >= 1 || (presetZoom > 0.5 && liveHardwareZoom.supported)) {
      if (isRearCamera && activeCameraSource === "rear-ultrawide") {
        const activeTrack = activeVideoTrackRef.current;
        const currentDeviceId = activeTrack?.getSettings?.().deviceId;
        const restoreTargetDeviceId =
          (mainRearDeviceIdRef.current && mainRearDeviceIdRef.current !== currentDeviceId ? mainRearDeviceIdRef.current : null) ??
          (() => {
            const mainDecision = chooseBestRearMainCamera(cameraDescriptors, currentDeviceId);
            return mainDecision.strategy === "switch-camera" ? mainDecision.camera.deviceId : null;
          })();

        if (restoreTargetDeviceId) {
          try {
            await switchToDevice(restoreTargetDeviceId, "rear-main", "restore-main-rear");
            mainRearDeviceIdRef.current = restoreTargetDeviceId;
            console.info("[live-camera] MAIN_REAR_RESTORED_FOR_PRESET", {
              presetZoom,
              deviceId: restoreTargetDeviceId
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "unknown";
            setZoomStatusMessage("Unable to restore main rear camera in this browser session");
            console.warn("[live-camera] MAIN_REAR_RESTORE_FAILED", { presetZoom, message, deviceId: restoreTargetDeviceId });
            return;
          }
        } else {
          setZoomStatusMessage("Unable to identify a main rear camera in this browser session");
          console.info("[live-camera] MAIN_REAR_RESTORE_UNAVAILABLE", { presetZoom, reason: "no_confident_main_rear_candidate" });
          return;
        }
      }

      const applied = await updateHardwareZoom(presetZoom);
      if (!applied && presetZoom > 1) {
        setZoomStatusMessage(null);
      } else if (!applied && presetZoom === 1) {
        selectedZoomRef.current = 1;
        setSelectedZoomPreset(1);
        setZoomStatusMessage(null);
      } else {
        setZoomStatusMessage(null);
      }
      return;
    }

    if (presetZoom !== 0.5) {
      setZoomStatusMessage(null);
      return;
    }

    if (liveHardwareZoom.supported && liveHardwareZoom.min <= 0.51) {
      const applied = await updateHardwareZoom(0.5);
      if (applied) {
        setZoomStatusMessage("0.5x using hardware zoom");
        console.info("[live-camera] HALF_X_RESOLUTION", { strategy: "hardware-zoom" });
        return;
      }
    }

    const activeTrack = activeVideoTrackRef.current;
    const activeSettings = activeTrack?.getSettings?.();
    const decision = chooseBestRearCameraForZoomPreset(0.5, cameraDescriptors, {
      deviceId: activeSettings?.deviceId,
      facing: isRearCamera ? "rear" : "front",
      zoomSupport: liveHardwareZoom.supported ? { ...liveHardwareZoom, current: liveHardwareZoom.value } : { supported: false }
    });
    let resolvedDecision = decision;
    if (
      decision.strategy === "unavailable" &&
      decision.reason === "no_reliable_ultrawide_or_alternate_rear_candidate" &&
      isRearCamera
    ) {
      console.info("[live-camera] HALF_X_PROBE_RETRY_START", {
        reason: decision.reason,
        rearCameraCount: cameraDescriptors.filter((descriptor) => descriptor.facing === "rear").length
      });
      try {
        const probedDescriptors = await buildVideoInputDescriptors();
        setCameraDescriptors(probedDescriptors);
        resolvedDecision = chooseBestRearCameraForZoomPreset(0.5, probedDescriptors, {
          deviceId: activeSettings?.deviceId,
          facing: "rear",
          zoomSupport: liveHardwareZoom.supported ? { ...liveHardwareZoom, current: liveHardwareZoom.value } : { supported: false }
        });
        console.info("[live-camera] HALF_X_PROBE_RETRY_RESULT", {
          strategy: resolvedDecision.strategy,
          reason: resolvedDecision.reason
        });
      } catch (error) {
        console.warn("[live-camera] HALF_X_PROBE_RETRY_FAILED", {
          message: error instanceof Error ? error.message : "unknown"
        });
      }
    }
    if (resolvedDecision.strategy !== "switch-camera") {
      setZoomStatusMessage("0.5x ultrawide lens not accessible from this browser session");
      console.info("[live-camera] HALF_X_UNAVAILABLE", { reason: resolvedDecision.reason, source: activeCameraSource });
      return;
    }

    try {
      if (activeSettings?.deviceId) {
        mainRearDeviceIdRef.current = activeSettings.deviceId;
      }
      await switchToDevice(resolvedDecision.camera.deviceId, "rear-ultrawide", "switch-to-ultrawide");
      selectedZoomRef.current = 0.5;
      setSelectedZoomPreset(selectedZoomRef.current);
      setZoomStatusMessage("0.5x using ultrawide camera");
      overlayNeedsResizeSyncRef.current = true;
      syncOverlayCanvasSize(true);
      console.info("[live-camera] HALF_X_RESOLUTION", {
        strategy: "camera-switch",
        decisionReason: resolvedDecision.reason,
        deviceId: resolvedDecision.camera.deviceId,
        label: resolvedDecision.camera.label
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      setZoomStatusMessage("0.5x ultrawide lens not accessible from this browser session");
      console.warn("[live-camera] HALF_X_SWITCH_FAILED", {
        message,
        deviceId: resolvedDecision.camera.deviceId,
        label: resolvedDecision.camera.label
      });
    }
  }, [activeCameraSource, cameraDescriptors, isRearCamera, liveHardwareZoom, status, switchToDevice, syncOverlayCanvasSize, updateHardwareZoom]);

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

  const playTestSound = useCallback(async () => {
    if (!isLiveAudioSupported) {
      return;
    }
    await audioCueControllerRef.current?.prime();
    await audioCueControllerRef.current?.playTestCue(liveAudioCueStyle);
  }, [isLiveAudioSupported, liveAudioCueStyle]);

  const toggleAudioCues = useCallback(async () => {
    if (!isLiveAudioSupported) {
      return;
    }
    if (!liveAudioEnabled) {
      const primed = await audioCueControllerRef.current?.prime();
      setLiveAudioEnabled(true);
      setIsLiveAudioPrimed(Boolean(primed));
      if (primed) {
        await audioCueControllerRef.current?.playActivationConfirm(liveAudioCueStyle);
      }
      return;
    }
    if (!isLiveAudioPrimed) {
      const primed = await audioCueControllerRef.current?.prime();
      setIsLiveAudioPrimed(Boolean(primed));
      if (primed) {
        await audioCueControllerRef.current?.playActivationConfirm(liveAudioCueStyle);
      }
      return;
    }
    setLiveAudioEnabled(false);
    setIsLiveAudioPrimed(false);
  }, [isLiveAudioPrimed, isLiveAudioSupported, liveAudioCueStyle, liveAudioEnabled]);

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
    setPostAnalysisSnapshot(null);
    setReplayState("idle");
    setReplayExportStageLabel(null);
    setShowRawDuringProcessing(false);
    setCompletedPreviewSurface("raw");
    setAnnotatedReplayFailureMessage(null);
    setAnnotatedReplayMimeType(null);
    setAnnotatedReplayFailureDetails(null);
    setLiveAnalysisSession(null);
    setErrorMessage(null);
  }, [annotatedReplayUrl, cleanupSession, rawReplayUrl]);

  const stopSession = useCallback(async () => {
    if (!recorderRef.current || !traceRef.current || !previewVideoRef.current) return;
    const mediaStopMs = Math.max(mediaStartMsRef.current, previewVideoRef.current.currentTime * 1000);
    sessionActiveRef.current = false;
    stopLiveRenderLoop();
    smoothedFrameRef.current = null;
    jointVisibleRef.current = {};
    jointGraceSamplesRef.current = {};
    lastPoseFrameAtRef.current = 0;
    lastAcceptedLandmarkTimestampRef.current = 0;
    lastAcceptedLandmarkPerfNowRef.current = 0;
    lastRenderedLandmarkTimestampRef.current = 0;
    stalePoseLoggedRef.current = false;
    clearLiveOverlayCanvas();
    previewVideoRef.current.srcObject = null;
    updateTrackingStatus("Tracking ready");
    updateFramingWarning(null);
    setStatus("stopping-finalizing");

    const recorder = recorderRef.current;
    const traceAccumulator = traceRef.current;
    const cadenceStatsSnapshot = { ...liveCadenceStatsRef.current };
    const captureStopPerfNowMs = performance.now();
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
      detectionDurationAvgMs: Number((cadenceStatsSnapshot.totalDetectionDurationMs / Math.max(1, cadenceStatsSnapshot.detectionInvocations)).toFixed(1)),
      detectionDurationLatestMs: Number(cadenceStatsSnapshot.latestDetectionDurationMs.toFixed(1)),
      traceFreshness
    });

    const completedSummary = buildLiveResultsSummary(trace);
    const completedTimelineMarkers = mapLiveTraceToTimelineMarkers(trace, phaseLabelMap);
    const analysisSession = buildAnalysisSessionFromLiveTrace(trace);
    setPostAnalysisSnapshot({
      traceId: trace.traceId,
      durationMs: trace.video.durationMs,
      width: trace.video.width,
      height: trace.video.height,
      processingSummary: {
        schemaVersion: "live-analysis-v1",
        averageConfidence: trace.summary.confidenceAvg ?? 0,
        sampledFrameCount: trace.captures.length,
        durationMs: trace.video.durationMs
      },
      poseTimeline: buildLivePoseTimeline(trace),
      summary: completedSummary,
      timelineMarkers: completedTimelineMarkers,
      cameraView: selection.cameraView
    });
    setLiveAnalysisSession(analysisSession);
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
    setReplayExportStageLabel(formatAnnotatedRenderProgressLabel({ stageLabel: "Preparing export…", completed: false }));
    setShowRawDuringProcessing(false);
    setCompletedPreviewSurface("raw");
    setAnnotatedReplayFailureMessage(null);
    setAnnotatedReplayMimeType(null);
    setAnnotatedReplayFailureDetails(null);
    setPreviewAspectRatio(metadata.width > 0 && metadata.height > 0 ? metadata.width / metadata.height : 16 / 9);

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
          setReplayExportStageLabel(formatAnnotatedRenderProgressLabel({ stageLabel, completed: false }));
        }
      });
      const annotatedUrl = URL.createObjectURL(annotated.blob);
      setAnnotatedReplayUrl(annotatedUrl);
      setAnnotatedReplayBlob(annotated.blob);
      setAnnotatedReplayMimeType(annotated.mimeType);
      setReplayExportStageLabel(
        formatAnnotatedRenderProgressLabel({
          stageLabel: `Rendering frames ${annotated.diagnostics.renderedFrameCount}/${Math.max(1, Math.floor(annotated.diagnostics.sourceDurationSec * annotated.diagnostics.renderFpsTarget) + 1)}`,
          completed: true
        }) ?? "Annotated export complete"
      );
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
  }, [cleanupSession, clearLiveOverlayCanvas, phaseLabelMap, selection.cameraView, stopLiveRenderLoop, updateFramingWarning, updateTrackingStatus]);

  const showReferencePanel = isReferencePanelVisible;

  const liveReviewModel = useMemo(
    () => buildAnalysisReviewModel(liveViewerModel, "live"),
    [liveViewerModel]
  );

  useEffect(() => {
    if (status === "live-session-running") {
      setAttemptSaveState("idle");
    }
  }, [status]);

  useEffect(() => {
    const traceId = postAnalysisSnapshot?.traceId;
    const hasResultData = Boolean(liveAnalysisSession && liveAnalysisSession.events.length > 0);
    const canSave = Boolean(traceId && liveAnalysisSession && liveAnalysisSession.status === "completed" && hasResultData);
    if (!canSave || !traceId) {
      return;
    }
    if (savedAttemptTraceIdsRef.current.has(traceId)) {
      return;
    }
    savedAttemptTraceIdsRef.current.add(traceId);

    const attempt = buildSavedAttemptSummary({
      review: liveReviewModel,
      source: "live",
      drillId: selection.drill?.drillId,
      createdAt: liveAnalysisSession?.completedAtIso ?? new Date().toISOString()
    });

    void resolveBrowserAttemptHistoryRepository(session).then((repository) => repository.saveAttempt(attempt))
      .then(() => setAttemptSaveState("saved"))
      .catch(() => {
        setAttemptSaveState("error");
        savedAttemptTraceIdsRef.current.delete(traceId);
      });
  }, [liveAnalysisSession, liveReviewModel, postAnalysisSnapshot?.traceId, selection.drill?.drillId, session]);

  return (
    <section className={`panel-content live-streaming-layout ${isSessionStageActive ? "live-streaming-layout--session-active" : ""}`}>
      <div className={`card live-streaming-intro-card ${isLivePhase || isPostAnalysisPhase ? "live-streaming-passive-chrome-hidden" : ""}`}>
        <strong>Live session setup</strong>
        <p className="muted" style={{ margin: "0.35rem 0 0" }}>
          Choose drill, frame your body, start session, and receive live drill-aware feedback with replay export at the end.
        </p>
      </div>

      {/* Shared setup shell keeps Upload and Live aligned while preserving source-specific inputs. */}
      <div className={isLivePhase || isPostAnalysisPhase ? "live-streaming-passive-chrome-hidden" : undefined}>
      <DrillSetupShell
        showReferencePanel={showReferencePanel}
        leftPane={
          <div style={{ display: "grid", gap: "0.85rem" }}>
            <DrillSetupHeader
              title="Live Streaming"
              description={
                status === "live-session-running"
                  ? "Camera session is active. Reference animation can stay collapsed while you capture."
                  : "Set drill and framing before starting the camera session."
              }
              showReferencePanel={showReferencePanel}
              onToggleReferencePanel={() => setIsReferencePanelVisible((current) => !current)}
            />
            <CaptureSetupGuidance
              mode="live"
              cameraViewLabel={selection.cameraView ? formatCameraViewLabel(selection.cameraView) : null}
              drillTypeLabel={selection.drill ? (selection.drill.drillType === "rep" ? "Rep" : "Hold") : null}
            />
            <article className="card drill-setup-shell-card" style={{ display: "grid", gap: "0.8rem" }}>
              <p className="muted" style={{ margin: 0, fontSize: "0.86rem" }}>
                Live overlay runs at {LIVE_ANALYSIS_CADENCE_FPS} FPS analysis / {LIVE_OVERLAY_PRESENTATION_FPS} FPS presentation with automatic raw + annotated replay export.
              </p>
              <div className="drill-selector-stack">
                <div className="live-streaming-control-row">
                  <label className="live-streaming-control-field">
                  <span>Camera</span>
                  <select
                    className="live-streaming-control-input"
                    value={isRearCamera ? "rear" : "front"}
                    onChange={(event) => {
                      const nextRear = event.target.value === "rear";
                      setIsRearCamera(nextRear);
                      setActiveCameraSource(nextRear ? "rear-main" : "front");
                      mainRearDeviceIdRef.current = nextRear ? mainRearDeviceIdRef.current : null;
                      setZoomStatusMessage(null);
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
                  <DrillOriginSelectField
                    selectedSource={selectedSource}
                    onSelectedSourceChange={setSelectedSource}
                    disabled={status === "live-session-running" || status === "requesting-permission"}
                    labelClassName="live-streaming-control-field"
                    inputClassName="live-streaming-control-input"
                  />
                </div>
                <DrillComboboxField
                  selectedSource={selectedSource}
                  selectedDrillKey={selectedKey}
                  onSelectedDrillKeyChange={setSelectedKey}
                  drillOptionsBySource={drillOptionGroups}
                  fallbackKey={FREESTYLE_KEY}
                  freestyleLabel="No drill · Freestyle"
                  disabled={status === "live-session-running" || status === "requesting-permission"}
                  labelClassName="live-streaming-control-field"
                  inputClassName="live-streaming-control-input"
                  helperClassName="muted"
                />
                <div className="live-streaming-control-field">
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
              <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                If tracking drops, check full-body framing and camera angle first.
              </p>
            </article>
          </div>
        }
        rightPane={
          <ReferenceAnimationPanel
            drill={selectedDrill?.drill ?? null}
            sourceKind={selectedDrill?.sourceKind}
            benchmarkState={selectedDrill?.benchmarkState}
            freestyleDescription="Live Streaming runs camera tracking without drill-specific rep, hold, or phase scoring until a drill is selected."
          />
        }
      />
      </div>

      <article ref={sessionStageRef} className={`card live-streaming-results-card ${isSessionStageActive ? "live-streaming-results-card--session-active" : ""}`}>
        {isLivePhase ? (
          <div className="live-streaming-preview-shell">
            <div className={`live-cockpit-shell ${isMobileViewport && !isMobileCoachingCueVisible ? "live-cockpit-shell--mobile-cue-hidden" : ""}`}>
              {shouldShowSessionToolbar ? (
                <div className="live-streaming-session-toolbar">
                  <div className="pill">Drill: {selection.drillBindingLabel}</div>
                  <span className="live-streaming-session-status">Tracking: {trackingStatusLabel}</span>
                </div>
              ) : null}
              <div className="live-cockpit-grid">
                <div className="live-cockpit-video-pane">
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
                      style={{ transform: isRearCamera ? "none" : "scaleX(-1)" }}
                    />
                    <canvas ref={previewCanvasRef} className="live-streaming-overlay-canvas" style={{ display: isLivePhase ? "block" : "none" }} />
                    {status === "live-session-running" && framingWarning ? <div className="live-streaming-zoom-unsupported">{framingWarning}</div> : null}
                  </div>
                  <div className="live-cockpit-mobile-summary">
                    <div className="live-cockpit-mobile-chip">
                      <span>Phase</span>
                      <strong>{hasSelectedDrill ? (livePhaseDisplayLabel || "Waiting for movement") : "Select a drill"}</strong>
                    </div>
                    <div className="live-cockpit-mobile-chip">
                      <span>{selection.drill?.drillType === "hold" ? "Hold" : "Reps"}</span>
                      <strong>
                        {!selection.drill
                          ? "Select a drill"
                          : selection.drill.drillType === "hold"
                            ? formatLiveSeconds(liveHudState.holdElapsedMs)
                            : `${liveHudState.repCount} reps`}
                      </strong>
                    </div>
                  </div>
                  {authoredPhases.length > 0 ? (
                    <div className="live-cockpit-phase-timeline-desktop" aria-label="Phase timeline">
                      {authoredPhases.map((phase, index) => (
                        <div key={phase.phaseId} className={`live-cockpit-phase-chip ${phase.phaseId === liveHudState.phaseId ? "is-active" : ""}`}>
                          <span>{index + 1}. {phaseDisplayLabel(phase)}</span>
                          {phase.durationMs > 0 ? <small>{Math.round(phase.durationMs / 1000)}s</small> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <aside className="live-cockpit-panel">
                  <article className="live-cockpit-card live-cockpit-card--desktop-metric">
                    <h4>Current Phase</h4>
                    <strong>{hasSelectedDrill ? (livePhaseDisplayLabel || "Waiting for movement") : "Select a drill to start live coaching"}</strong>
                    <p className="muted" style={{ margin: 0 }}>
                      {hasSelectedDrill
                        ? authoredPhases.length > 0 && livePhaseIndex >= 0
                          ? `Phase ${livePhaseIndex + 1} of ${authoredPhases.length}`
                          : "Waiting for movement"
                        : "Select a drill to start live coaching"}
                    </p>
                  </article>
                  <article className="live-cockpit-card live-cockpit-card--desktop-metric">
                    <h4>{selection.drill?.drillType === "hold" ? "Hold" : "Reps"}</h4>
                    <strong>
                      {!selection.drill
                        ? "Select a drill"
                        : selection.drill.drillType === "hold"
                          ? formatLiveSeconds(liveHudState.holdElapsedMs)
                          : `${liveHudState.repCount} reps`}
                    </strong>
                  </article>
                  {shouldShowCoachingCueCard ? (
                    <article className="live-cockpit-card">
                      <h4>Coaching Cue</h4>
                      <p style={{ margin: 0 }}>{liveCoachingCue}</p>
                    </article>
                  ) : null}
                  <div className="live-cockpit-controls">
                    <div className="live-cockpit-controls-primary">
                      <button type="button" className="studio-button studio-button-danger" onClick={() => void stopSession()}>
                        Stop stream
                      </button>
                      {isFullscreenSupported ? (
                        <button type="button" className="studio-button" onClick={() => void toggleSessionFullscreen()}>
                          {isStageFullscreen ? "Exit fullscreen" : "Fullscreen"}
                        </button>
                      ) : null}
                      <button type="button" className="studio-button" onClick={() => void toggleAudioCues()} disabled={!isLiveAudioSupported}>
                        Audio cues: {!liveAudioEnabled ? "Off" : isLiveAudioPrimed ? "On" : "Ready: tap to enable"}
                      </button>
                    </div>
                    <div className="live-cockpit-controls-secondary live-cockpit-controls-secondary--desktop">
                      {isLiveAudioSupported ? (
                        <button type="button" className="studio-button live-cockpit-desktop-only" onClick={() => void playTestSound()} style={{ padding: "0.3rem 0.55rem", fontSize: "0.78rem" }}>
                          Test sound
                        </button>
                      ) : null}
                    </div>
                    {isMobileViewport && isMobilePortraitViewport ? (
                      <div className={`live-cockpit-mobile-tray ${isMobileControlsTrayExpanded ? "is-expanded" : ""}`}>
                        <button
                          type="button"
                          className="live-cockpit-mobile-tray-toggle"
                          aria-expanded={isMobileControlsTrayExpanded}
                          aria-controls={mobileControlsTrayId}
                          onClick={() => setIsMobileControlsTrayExpanded((expanded) => !expanded)}
                        >
                          <span>More controls</span>
                          <span aria-hidden>{isMobileControlsTrayExpanded ? "▲" : "▾"}</span>
                        </button>
                        <div
                          id={mobileControlsTrayId}
                          className="live-cockpit-mobile-tray-panel"
                          aria-hidden={!isMobileControlsTrayExpanded}
                        >
                          <div className="live-cockpit-mobile-advanced-body">
                            <div className="live-cockpit-mobile-advanced-section">
                              <h5>Audio</h5>
                              <div className="live-cockpit-controls-secondary">
                                {isLiveAudioSupported ? (
                                  <button type="button" className="studio-button live-cockpit-mobile-only" onClick={() => void playTestSound()}>
                                    Test sound
                                  </button>
                                ) : null}
                                <button type="button" className="studio-button live-cockpit-mobile-only" onClick={() => setIsMobileCoachingCueVisible((visible) => !visible)}>
                                  {isMobileCoachingCueVisible ? "Hide coaching cue" : "Show coaching cue"}
                                </button>
                                <label className="live-cockpit-cue-select">
                                  <span>Cue style</span>
                                  <select value={liveAudioCueStyle} onChange={(event) => setLiveAudioCueStyle(event.target.value as LiveAudioCueStyle)} disabled={!isLiveAudioSupported}>
                                    <option value="beep">Beep</option>
                                    <option value="chime">Chime</option>
                                    <option value="voice-count">{selection.drill?.drillType === "hold" ? "Voice count / chime" : "Voice count"}</option>
                                    <option value="silent">Silent</option>
                                  </select>
                                </label>
                              </div>
                            </div>
                            {status === "live-session-running" ? (
                              <div className="live-cockpit-mobile-advanced-section">
                                <h5>Camera</h5>
                                <div className="live-cockpit-zoom-row">
                                  <div className="live-streaming-zoom-control" role="group" aria-label="Camera zoom control">
                                    <span className="live-streaming-zoom-label">Zoom</span>
                                    <div className="live-streaming-zoom-presets">
                                      {APP_HARDWARE_ZOOM_PRESETS.map((preset) => {
                                        const isActive = activeZoomPreset === preset;
                                        const isDisabled = preset === 0.5 && !halfXAccess.available && !canAttemptHalfXFallbackProbe;
                                        return (
                                          <button
                                            key={preset}
                                            type="button"
                                            className={`live-streaming-zoom-chip ${isActive ? "is-active" : ""}`}
                                            aria-pressed={isActive}
                                            disabled={isDisabled}
                                            title={isDisabled ? "0.5x ultrawide lens not accessible from this browser session" : preset === 0.5 && canAttemptHalfXFallbackProbe ? "Tap to probe alternate rear cameras for ultrawide access" : undefined}
                                            onClick={() => {
                                              void handleZoomPresetSelection(preset);
                                            }}
                                          >
                                            {formatHardwareZoomLabel(preset)}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <span>{formatHardwareZoomLabel(selectedZoomRef.current)}</span>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                            {authoredPhases.length > 0 ? (
                              <div className="live-cockpit-mobile-advanced-section">
                                <h5>Drill phase</h5>
                                <div className="live-cockpit-timeline">
                                  {authoredPhases.map((phase, index) => (
                                    <div key={phase.phaseId} className={`live-cockpit-phase-chip ${phase.phaseId === liveHudState.phaseId ? "is-active" : ""}`}>
                                      <span>{index + 1}. {phaseDisplayLabel(phase)}</span>
                                      {phase.durationMs > 0 ? <small>{Math.round(phase.durationMs / 1000)}s</small> : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {zoomHelperText ? (
                              <p className="muted" style={{ marginTop: "0.2rem", marginBottom: 0, fontSize: "0.75rem" }}>
                                {zoomHelperText}
                              </p>
                            ) : null}
                            {!isLiveAudioSupported ? <p className="muted" style={{ margin: 0, fontSize: "0.74rem" }}>Audio cues unavailable in this browser. Live coaching will stay silent.</p> : null}
                            {isLiveAudioSupported && liveAudioEnabled && !isLiveAudioPrimed ? (
                              <p className="muted" style={{ margin: 0, fontSize: "0.74rem" }}>
                                Audio cues are ready. Tap the audio button once to enable sound in this session.
                              </p>
                            ) : null}
                            {isLiveAudioSupported && liveAudioEnabled && isLiveAudioPrimed ? (
                              <p className="muted" style={{ margin: 0, fontSize: "0.74rem" }}>
                                Sound is on. Cues play when reps complete or holds start.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <details className="live-cockpit-mobile-advanced">
                        <summary>More controls</summary>
                        <div className="live-cockpit-mobile-advanced-body">
                          <div className="live-cockpit-timeline">
                            {authoredPhases.length > 0 ? authoredPhases.map((phase, index) => (
                              <div key={phase.phaseId} className={`live-cockpit-phase-chip ${phase.phaseId === liveHudState.phaseId ? "is-active" : ""}`}>
                                <span>{index + 1}. {phaseDisplayLabel(phase)}</span>
                                {phase.durationMs > 0 ? <small>{Math.round(phase.durationMs / 1000)}s</small> : null}
                              </div>
                            )) : (
                              <div className="live-cockpit-empty">Select a drill to start live coaching.</div>
                            )}
                          </div>
                          <div className="live-cockpit-controls-secondary">
                            {isLiveAudioSupported ? (
                              <button type="button" className="studio-button live-cockpit-mobile-only" onClick={() => void playTestSound()}>
                                Test sound
                              </button>
                            ) : null}
                            {isMobileViewport ? (
                              <button type="button" className="studio-button live-cockpit-mobile-only" onClick={() => setIsMobileCoachingCueVisible((visible) => !visible)}>
                                {isMobileCoachingCueVisible ? "Hide coaching cue" : "Show coaching cue"}
                              </button>
                            ) : null}
                            <label className="live-cockpit-cue-select">
                              <span>Cue style</span>
                              <select value={liveAudioCueStyle} onChange={(event) => setLiveAudioCueStyle(event.target.value as LiveAudioCueStyle)} disabled={!isLiveAudioSupported}>
                                <option value="beep">Beep</option>
                                <option value="chime">Chime</option>
                                <option value="voice-count">{selection.drill?.drillType === "hold" ? "Voice count / chime" : "Voice count"}</option>
                                <option value="silent">Silent</option>
                              </select>
                            </label>
                            {status === "live-session-running" ? (
                              <div className="live-cockpit-zoom-row">
                                <div className="live-streaming-zoom-control" role="group" aria-label="Camera zoom control">
                                  <span className="live-streaming-zoom-label">Zoom</span>
                                  <div className="live-streaming-zoom-presets">
                                    {APP_HARDWARE_ZOOM_PRESETS.map((preset) => {
                                      const isActive = activeZoomPreset === preset;
                                      const isDisabled = preset === 0.5 && !halfXAccess.available && !canAttemptHalfXFallbackProbe;
                                      return (
                                        <button
                                          key={preset}
                                          type="button"
                                          className={`live-streaming-zoom-chip ${isActive ? "is-active" : ""}`}
                                          aria-pressed={isActive}
                                          disabled={isDisabled}
                                          title={isDisabled ? "0.5x ultrawide lens not accessible from this browser session" : preset === 0.5 && canAttemptHalfXFallbackProbe ? "Tap to probe alternate rear cameras for ultrawide access" : undefined}
                                          onClick={() => {
                                            void handleZoomPresetSelection(preset);
                                          }}
                                        >
                                          {formatHardwareZoomLabel(preset)}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <span>{formatHardwareZoomLabel(selectedZoomRef.current)}</span>
                                </div>
                              </div>
                            ) : null}
                          </div>
                          {zoomHelperText ? (
                            <p className="muted" style={{ marginTop: "0.2rem", marginBottom: 0, fontSize: "0.75rem" }}>
                              {zoomHelperText}
                            </p>
                          ) : null}
                          {!isLiveAudioSupported ? <p className="muted" style={{ margin: 0, fontSize: "0.74rem" }}>Audio cues unavailable in this browser. Live coaching will stay silent.</p> : null}
                          {isLiveAudioSupported && liveAudioEnabled && !isLiveAudioPrimed ? (
                            <p className="muted" style={{ margin: 0, fontSize: "0.74rem" }}>
                              Audio cues are ready. Tap the audio button once to enable sound in this session.
                            </p>
                          ) : null}
                          {isLiveAudioSupported && liveAudioEnabled && isLiveAudioPrimed ? (
                            <p className="muted" style={{ margin: 0, fontSize: "0.74rem" }}>
                              Sound is on. Cues play when reps complete or holds start.
                            </p>
                          ) : null}
                        </div>
                      </details>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          </div>
        ) : null}

        {isPostAnalysisPhase && liveTrace ? (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
              {canOpenCompare ? (
                <button
                  type="button"
                  className="pill"
                  onClick={() => {
                    if (!selection.drill || !liveAnalysisSession) {
                      return;
                    }
                    writeCompareHandoffPayload({
                      source: "live",
                      fromPath: "/live",
                      drill: selection.drill,
                      drillAssets: selectedDrill?.assets,
                      analysisSession: liveAnalysisSession,
                      benchmarkFeedback,
                      coachingFeedback,
                      attemptVideoUrl: replayUrl ?? undefined,
                      benchmarkVideoUrl: selection.drill.benchmark?.media?.referenceVideoUri,
                      benchmarkPoses: selection.drill.benchmark?.phaseSequence?.map((phase) => phase.pose).filter((pose): pose is NonNullable<typeof pose> => Boolean(pose)),
                      attemptPoseFrames: postAnalysisSnapshot?.poseTimeline.frames ?? []
                    });
                    router.push("/compare");
                  }}
                >
                  Compare with benchmark
                </button>
              ) : null}
            </div>
            <AnalysisViewerShell
              model={liveViewerModel}
              videoRef={replayVideoRef}
              reviewSource="live"
              onSurfaceChange={(surface) => {
                setCompletedPreviewSurface(surface);
                if (replayState === "export-in-progress" && surface === "raw") {
                  setShowRawDuringProcessing(true);
                }
              }}
              onPhaseTimelineSelect={(segment) => {
                if (segment.interactive) {
                  setReplayTimestampMs(segment.seekTimestampMs);
                  seekVideoToTimestamp(replayVideoRef.current, segment.seekTimestampMs);
                }
              }}
            />
            {attemptSaveState === "saved" ? <p className="muted" style={{ marginTop: "0.35rem" }}>Attempt saved to history.</p> : null}
            {attemptSaveState === "error" ? <p className="muted" style={{ marginTop: "0.35rem" }}>Attempt could not be saved to history.</p> : null}
            {annotatedReplayFailureDetails ? (
              <details style={{ marginTop: "0.3rem" }}>
                <summary className="muted" style={{ cursor: "pointer" }}>Annotated export technical details</summary>
                <pre className="muted" style={{ whiteSpace: "pre-wrap", marginTop: "0.35rem" }}>{annotatedReplayFailureDetails}</pre>
              </details>
            ) : null}
          </>
        ) : null}
        {isPostAnalysisPhase && !liveTrace ? (
          <div className="result-preview-processing">
            <strong>Finalizing replay</strong>
            <p className="muted" style={{ margin: 0 }}>Preparing post-analysis results…</p>
          </div>
        ) : null}
      </article>
    </section>
  );
}
