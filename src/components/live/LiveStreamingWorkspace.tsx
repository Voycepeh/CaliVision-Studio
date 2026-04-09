"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { fitVideoCoverRect, isPreviewSurfaceReady, resolveOverlayCanvasSize, type OverlayProjection } from "@/lib/live/overlay-geometry";
import { buildDuplicateSafeDrillLabel, formatDrillSourceLabel, toDrillSourceKind } from "@/lib/drill-source";
import type { CanonicalJointName } from "@/lib/schema/contracts";
import { listHostedLibrary } from "@/lib/hosted/library-repository";
import { loadDraft, loadDraftList } from "@/lib/persistence/local-draft-store";
import { resolveSelectedDrillKey } from "@/lib/upload/drill-selection";
import { createPoseLandmarkerForJob, mapLandmarksToPoseFrame } from "@/lib/upload/pose-landmarker";
import { drawAnalysisOverlay, drawPoseOverlay } from "@/lib/upload/overlay";
import {
  buildLiveResultsSummary,
  classifyCameraError,
  createLiveTraceAccumulator,
  createMediaRecorder,
  exportAnnotatedReplayFromLiveTrace,
  getCameraSupportStatus,
  getReplayStateMessage,
  getReplayStateTone,
  mapLiveTraceToTimelineMarkers,
  stopMediaStream,
  type LiveDrillSelection,
  type LiveSessionStatus,
  type LiveSessionTrace,
  type ReplayTerminalState
} from "@/lib/live";
import { buildAnalysisSessionFromLiveTrace } from "@/lib/live/session-compositor";

const LIVE_OVERLAY_CADENCE_FPS = 10;
const LIVE_SAMPLE_INTERVAL_MS = Math.round(1000 / LIVE_OVERLAY_CADENCE_FPS);
const FREESTYLE_KEY = "freestyle";
const LANDMARK_SMOOTHING_ALPHA = 0.38;
const JOINT_VISIBILITY_ENTER_THRESHOLD = 0.52;
const JOINT_VISIBILITY_EXIT_THRESHOLD = 0.42;
const JOINT_VISIBILITY_GRACE_SAMPLES = 2;
const LIVE_POSE_STALE_HOLD_MS = 420;

async function readRecordedVideoMetadata(blob: Blob): Promise<{ durationMs: number; width: number; height: number }> {
  const objectUrl = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = objectUrl;

  const metadata = await new Promise<{ durationMs: number; width: number; height: number }>((resolve, reject) => {
    video.onloadedmetadata = () => {
      resolve({
        durationMs: Math.max(0, Math.round(video.duration * 1000)),
        width: video.videoWidth || 720,
        height: video.videoHeight || 1280
      });
    };
    video.onerror = () => reject(new Error("Unable to load recorded video metadata."));
  });

  URL.revokeObjectURL(objectUrl);
  return metadata;
}

type DrillSelectionOption = {
  key: string;
  label: string;
  sourceKind: "local" | "hosted";
  sourceId?: string;
  packageVersion?: string;
  drill: NonNullable<LiveDrillSelection["drill"]>;
};

function buildPhaseLabelMap(drill?: NonNullable<LiveDrillSelection["drill"]>): Record<string, string> {
  if (!drill) {
    return {};
  }
  return drill.phases.reduce<Record<string, string>>((acc, phase) => {
    const label = (phase.name || phase.title || "").trim();
    if (label) {
      acc[phase.phaseId] = label;
    }
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
  const { session, isConfigured } = useAuth();
  const [status, setStatus] = useState<LiveSessionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [drillOptions, setDrillOptions] = useState<DrillSelectionOption[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>(FREESTYLE_KEY);
  const [isRearCamera, setIsRearCamera] = useState(true);
  const [liveTrace, setLiveTrace] = useState<LiveSessionTrace | null>(null);
  const [rawReplayUrl, setRawReplayUrl] = useState<string | null>(null);
  const [annotatedReplayUrl, setAnnotatedReplayUrl] = useState<string | null>(null);
  const [replayState, setReplayState] = useState<ReplayTerminalState>("idle");
  const [replayExportStageLabel, setReplayExportStageLabel] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
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
  const stalePoseLoggedRef = useRef(false);

  const selectedDrill = useMemo(
    () => (selectedKey === FREESTYLE_KEY ? null : drillOptions.find((option) => option.key === selectedKey) ?? null),
    [drillOptions, selectedKey]
  );
  const groupedDrillOptions = useMemo(() => {
    const titleCounts = new Map<string, number>();
    for (const option of drillOptions) {
      const key = option.drill.title.trim().toLowerCase();
      titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
    }
    const localOptions: Array<DrillSelectionOption & { displayLabel: string }> = [];
    const cloudOptions: Array<DrillSelectionOption & { displayLabel: string }> = [];

    for (const option of drillOptions) {
      const duplicateTitleCount = titleCounts.get(option.drill.title.trim().toLowerCase()) ?? 1;
      const withDisplayLabel = {
        ...option,
        displayLabel: buildDuplicateSafeDrillLabel({
          baseLabel: option.label,
          sourceKind: option.sourceKind,
          sourceId: option.sourceId,
          duplicateTitleCount
        })
      };
      if (toDrillSourceKind(option.sourceKind) === "cloud") {
        cloudOptions.push(withDisplayLabel);
      } else {
        localOptions.push(withDisplayLabel);
      }
    }
    return { localOptions, cloudOptions };
  }, [drillOptions]);

  const selection: LiveDrillSelection = useMemo(() => {
    if (!selectedDrill) {
      return {
        mode: "freestyle",
        drillBindingLabel: "No drill · Freestyle",
        drillBindingSource: "freestyle"
      };
    }

    return {
      mode: "drill",
      drill: selectedDrill.drill,
      drillVersion: selectedDrill.packageVersion,
      drillBindingLabel: selectedDrill.drill.title,
      drillBindingSource: selectedDrill.sourceKind,
      sourceId: selectedDrill.sourceId
    };
  }, [selectedDrill]);

  const summary = useMemo(() => (liveTrace ? buildLiveResultsSummary(liveTrace) : null), [liveTrace]);
  const timelineMarkers = useMemo(() => (liveTrace ? mapLiveTraceToTimelineMarkers(liveTrace) : []), [liveTrace]);
  const replayUrl = annotatedReplayUrl ?? rawReplayUrl;
  const replayTone = getReplayStateTone(replayState);
  const selectedMarker = useMemo(() => timelineMarkers.find((marker) => marker.id === selectedMarkerId) ?? null, [selectedMarkerId, timelineMarkers]);

  useEffect(() => {
    if (timelineMarkers.length === 0) {
      setSelectedMarkerId(null);
      return;
    }
    setSelectedMarkerId((current) => (current && timelineMarkers.some((marker) => marker.id === current) ? current : timelineMarkers[0].id));
  }, [timelineMarkers]);

  const refreshDrillOptions = useCallback(async () => {
    const options: DrillSelectionOption[] = [];
    try {
      const local = await loadDraftList();
      for (const summaryItem of local.slice(0, 20)) {
        const loaded = await loadDraft(summaryItem.draftId);
        const drill = loaded?.record.packageJson.drills[0];
        if (!drill) continue;
        options.push({
          key: `local:${summaryItem.draftId}:${drill.drillId}`,
          label: drill.title,
          sourceKind: "local",
          sourceId: summaryItem.draftId,
          packageVersion: loaded.record.packageJson.manifest.packageVersion,
          drill
        });
      }
    } catch {
      // local draft list optional
    }

    if (session && isConfigured) {
      const hosted = await listHostedLibrary(session);
      if (hosted.ok) {
        for (const item of hosted.value) {
          const drill = item.content.drills[0];
          if (!drill) continue;
          options.push({
            key: `hosted:${item.id}:${drill.drillId}`,
            label: drill.title,
            sourceKind: "hosted",
            sourceId: item.id,
            packageVersion: item.packageVersion,
            drill
          });
        }
      }
    }

    setDrillOptions(options);
    setSelectedKey((current) => resolveSelectedDrillKey(options, current) ?? FREESTYLE_KEY);
  }, [isConfigured, session]);

  useEffect(() => {
    void refreshDrillOptions();
  }, [refreshDrillOptions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (getCameraSupportStatus(window) === "unsupported") {
      setStatus("unsupported");
      setErrorMessage("Live Streaming is unsupported in this browser. Use a browser with camera + MediaRecorder support.");
    }
  }, []);

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
    landmarkerRef.current?.close?.();
    landmarkerRef.current = null;
    recorderRef.current = null;
    traceRef.current = null;
    smoothedFrameRef.current = null;
    lastPoseFrameAtRef.current = 0;
    stalePoseLoggedRef.current = false;
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
  }, []);

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
      const coverRect = fitVideoCoverRect({
        containerWidth: resized.backingWidth,
        containerHeight: resized.backingHeight,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight
      });
      overlayProjectionRef.current = {
        ...coverRect,
        mirrored: !isRearCamera
      };
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
    const onWindowResize = () => {
      overlayNeedsResizeSyncRef.current = true;
    };
    const onOrientationChange = () => {
      overlayNeedsResizeSyncRef.current = true;
    };
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("orientationchange", onOrientationChange);
    window.visualViewport?.addEventListener("resize", onWindowResize);
    return () => {
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("orientationchange", onOrientationChange);
      window.visualViewport?.removeEventListener("resize", onWindowResize);
    };
  }, []);

  useEffect(() => {
    return () => {
      void cleanupSession({ stopRecorder: true, discardRecording: true });
      if (annotatedReplayUrl) URL.revokeObjectURL(annotatedReplayUrl);
      if (rawReplayUrl) URL.revokeObjectURL(rawReplayUrl);
    };
  }, [annotatedReplayUrl, cleanupSession, rawReplayUrl]);

  const buildStabilizedPoseFrame = useCallback(
    (landmarks: Array<{ x: number; y: number; visibility?: number }>, timestampMs: number) => {
      const incoming = mapLandmarksToPoseFrame(landmarks, timestampMs);
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
    []
  );

  const startSession = useCallback(async () => {
    if (status === "requesting-permission" || status === "live-session-running" || status === "stopping-finalizing") {
      return;
    }

    setErrorMessage(null);
    setStatus("requesting-permission");
    setReplayState("idle");
    setReplayExportStageLabel(null);
    setLiveTrace(null);
    setSelectedMarkerId(null);
    if (annotatedReplayUrl) {
      URL.revokeObjectURL(annotatedReplayUrl);
      setAnnotatedReplayUrl(null);
    }
    if (rawReplayUrl) {
      URL.revokeObjectURL(rawReplayUrl);
      setRawReplayUrl(null);
    }

    await cleanupSession({ stopRecorder: true, discardRecording: true });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: isRearCamera ? { ideal: "environment" } : { ideal: "user" } },
        audio: false
      });
      liveStreamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        await previewVideoRef.current.play();
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

      traceRef.current = createLiveTraceAccumulator({
        traceId: `live_${Date.now()}`,
        startedAtIso: new Date().toISOString(),
        cadenceFps: LIVE_OVERLAY_CADENCE_FPS,
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

    let lastSampleAt = -LIVE_SAMPLE_INTERVAL_MS;
    const draw = () => {
      if (!previewVideoRef.current || !landmarkerRef.current || !traceRef.current) {
        return;
      }

      const elapsedMs = performance.now() - startedAtRef.current;
      const previewVideo = previewVideoRef.current;
      syncOverlayCanvasSize();
      const projection = overlayProjectionRef.current;
      if (!previewVideo || !projection) {
        liveLoopRef.current = requestAnimationFrame(draw);
        return;
      }
      const mediaTimeMs = Math.max(mediaStartMsRef.current, previewVideo.currentTime * 1000);
      const traceTimestampMs = Math.max(0, Math.round(mediaTimeMs - mediaStartMsRef.current));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const pixelRatio = overlayPixelRatioRef.current;
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      if (
        !isPreviewSurfaceReady({
          readyState: previewVideo.readyState,
          videoWidth: previewVideo.videoWidth,
          videoHeight: previewVideo.videoHeight,
          containerWidth: Math.round((mediaContainerRef.current?.getBoundingClientRect().width ?? 0) * pixelRatio),
          containerHeight: Math.round((mediaContainerRef.current?.getBoundingClientRect().height ?? 0) * pixelRatio),
          canvasWidth: canvas.width,
          canvasHeight: canvas.height
        })
      ) {
        logOverlayDiagnostics("draw-skipped-preview-not-ready");
        liveLoopRef.current = requestAnimationFrame(draw);
        return;
      }

      if (elapsedMs - lastSampleAt >= LIVE_SAMPLE_INTERVAL_MS) {
        const result = landmarkerRef.current.detectForVideo(previewVideo, mediaTimeMs);
        const landmarks = result.landmarks?.[0];
        if (landmarks) {
          const frame = buildStabilizedPoseFrame(landmarks, traceTimestampMs);
          traceRef.current.pushFrame(frame);
          lastPoseFrameAtRef.current = traceTimestampMs;
          stalePoseLoggedRef.current = false;
          logOverlayDiagnostics("draw-pose-frame");
        } else if (!stalePoseLoggedRef.current) {
          console.debug("[live-overlay] pose miss; reusing last stabilized frame", {
            traceTimestampMs,
            staleForMs: Math.max(0, traceTimestampMs - lastPoseFrameAtRef.current)
          });
          stalePoseLoggedRef.current = true;
        }
        lastSampleAt = elapsedMs;
      }

      const analyzedFrameState = traceRef.current.getAnalyzedFrameState(traceTimestampMs);
      const staleForMs = Math.max(0, traceTimestampMs - lastPoseFrameAtRef.current);
      const canReuseStalePose = lastPoseFrameAtRef.current > 0 && staleForMs <= LIVE_POSE_STALE_HOLD_MS;
      if (analyzedFrameState.poseFrame && canReuseStalePose) {
        drawPoseOverlay(ctx, canvas.width / pixelRatio, canvas.height / pixelRatio, analyzedFrameState.poseFrame, { projection });
      } else if (staleForMs > LIVE_POSE_STALE_HOLD_MS && stalePoseLoggedRef.current) {
        console.info("[live-overlay] stale pose timeout reached; clearing overlay skeleton", {
          traceTimestampMs,
          staleForMs,
          staleTimeoutMs: LIVE_POSE_STALE_HOLD_MS
        });
        stalePoseLoggedRef.current = false;
      }
      drawAnalysisOverlay(ctx, canvas.width / pixelRatio, canvas.height / pixelRatio, analyzedFrameState.overlay, {
        modeLabel: selection.drillBindingLabel,
        showDrillMetrics: selection.mode === "drill",
        phaseLabels: buildPhaseLabelMap(selection.drill)
      });

      liveLoopRef.current = requestAnimationFrame(draw);
    };

    draw();
  }, [annotatedReplayUrl, buildStabilizedPoseFrame, cleanupSession, isRearCamera, logOverlayDiagnostics, rawReplayUrl, selection, status, syncOverlayCanvasSize]);

  const resetToIdle = useCallback(async () => {
    await cleanupSession({ stopRecorder: true, discardRecording: true, nextStatus: "idle" });
    if (annotatedReplayUrl) {
      URL.revokeObjectURL(annotatedReplayUrl);
      setAnnotatedReplayUrl(null);
    }
    if (rawReplayUrl) {
      URL.revokeObjectURL(rawReplayUrl);
      setRawReplayUrl(null);
    }
    setLiveTrace(null);
    setReplayState("idle");
    setReplayExportStageLabel(null);
    setSelectedMarkerId(null);
    setErrorMessage(null);
  }, [annotatedReplayUrl, cleanupSession, rawReplayUrl]);

  const stopSession = useCallback(async () => {
    if (!recorderRef.current || !traceRef.current || !previewVideoRef.current) return;
    setStatus("stopping-finalizing");

    const recorder = recorderRef.current;
    const traceAccumulator = traceRef.current;
    const captureStopPerfNowMs = performance.now();
    const mediaStopMs = Math.max(mediaStartMsRef.current, previewVideoRef.current.currentTime * 1000);
    const raw = await recorder.stop();
    if (!raw) {
      setReplayState("export-failed");
      setStatus("failed");
      setErrorMessage("Live recording did not finalize correctly. Please retake.");
      return;
    }
    const metadata = await readRecordedVideoMetadata(raw.blob);
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

    setLiveTrace(trace);
    const rawUrl = URL.createObjectURL(raw.blob);
    setRawReplayUrl(rawUrl);
    setReplayState("export-in-progress");
    setReplayExportStageLabel("Preparing export…");

    const analysisSession = buildAnalysisSessionFromLiveTrace(trace);
    const rawFile = new File([raw.blob], `${trace.traceId}.webm`, { type: raw.mimeType });

    try {
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
      setReplayExportStageLabel("Annotated export complete");
      setReplayState("annotated-ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Annotated replay generation failed.";
      console.error("[live-overlay] annotated export failed", { message });
      setReplayState("raw-fallback");
      setReplayExportStageLabel("Annotated export failed");
      setErrorMessage(`${message} Showing raw session recording fallback.`);
    }

    setStatus("completed");
  }, [cleanupSession]);

  return (
    <section className="panel-content live-streaming-layout">
      <article className="card" style={{ display: "grid", gap: "0.8rem" }}>
        <h2 style={{ margin: 0 }}>Live Streaming</h2>
        <p className="muted" style={{ margin: 0 }}>
          Mobile browser camera session with lightweight live overlay at {LIVE_OVERLAY_CADENCE_FPS} FPS, raw recording in parallel, and post-session annotated replay from retained trace + recording.
        </p>
        <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
          <label style={{ display: "grid", gap: "0.3rem" }}>
            <span>Drill</span>
            <select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} disabled={status === "live-session-running" || status === "requesting-permission"}>
              <option value={FREESTYLE_KEY}>No drill · Freestyle</option>
              {groupedDrillOptions.localOptions.length > 0 ? (
                <optgroup label={`${formatDrillSourceLabel("local")} drills`}>
                  {groupedDrillOptions.localOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.displayLabel}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {groupedDrillOptions.cloudOptions.length > 0 ? (
                <optgroup label={`${formatDrillSourceLabel("cloud")} drills`}>
                  {groupedDrillOptions.cloudOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.displayLabel}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
          <label style={{ display: "grid", gap: "0.3rem" }}>
            <span>Camera</span>
            <button type="button" className="studio-button" onClick={() => setIsRearCamera((current) => !current)} disabled={status === "requesting-permission" || status === "live-session-running"}>
              {isRearCamera ? "Rear camera" : "Front camera"}
            </button>
          </label>
        </div>
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
              {replayUrl ? (
                <button
                  type="button"
                  className="studio-button studio-button-primary"
                  onClick={() => triggerDownload(replayUrl, `${liveTrace?.traceId ?? "live-session"}-${annotatedReplayUrl ? "annotated" : "raw"}.webm`)}
                >
                  Save replay
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
        {(status === "unsupported" || status === "stopping-finalizing") && !errorMessage ? (
          <p style={{ margin: 0, color: "#f2bbbb" }}>{status === "unsupported" ? "Live sessions are unavailable in this browser." : "Finalizing session..."}</p>
        ) : null}
        {errorMessage ? <p style={{ margin: 0, color: "#f2bbbb" }}>{errorMessage}</p> : null}
      </article>

      <article className="card live-streaming-results-card">
        <div className="live-streaming-preview-shell">
          <div ref={mediaContainerRef} className="live-streaming-media-container">
            <video
              ref={previewVideoRef}
              muted
              playsInline
              className="live-streaming-video"
              onLoadedMetadata={() => {
                overlayNeedsResizeSyncRef.current = true;
                syncOverlayCanvasSize(true);
              }}
              onResize={() => {
                overlayNeedsResizeSyncRef.current = true;
              }}
              style={{ display: status === "completed" ? "none" : "block", transform: isRearCamera ? "none" : "scaleX(-1)" }}
            />
            <canvas ref={previewCanvasRef} className="live-streaming-overlay-canvas" style={{ display: status === "live-session-running" ? "block" : "none" }} />
          </div>
        </div>

        {liveTrace ? (
          <>
            <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              <div className="pill">Drill: {summary?.drillLabel ?? "Freestyle"}</div>
              <div className="pill">Duration: {summary?.durationLabel ?? "0s"}</div>
              <div className="pill">Reps: {summary?.repCount ?? 0}</div>
              <div className="pill">Holds: {summary?.holdSummaryLabel ?? "No holds detected"}</div>
              <div className="pill">Phases: {summary?.phaseSummaryLabel ?? "No phase transitions detected"}</div>
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

            {replayUrl ? <video controls src={replayUrl} style={{ width: "100%", borderRadius: "0.8rem" }} /> : null}

            <section style={{ display: "grid", gap: "0.45rem" }}>
              <strong>Timeline</strong>
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
                      onClick={() => setSelectedMarkerId(marker.id)}
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
                      onClick={() => setSelectedMarkerId(marker.id)}
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
