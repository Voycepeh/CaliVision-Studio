"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
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

  const syncOverlayCanvasSize = useCallback(() => {
    const canvas = previewCanvasRef.current;
    const container = mediaContainerRef.current;
    if (!canvas || !container) return;

    const bounds = container.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }, []);

  useEffect(() => {
    const container = mediaContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const resizeObserver = new ResizeObserver(() => {
      syncOverlayCanvasSize();
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [syncOverlayCanvasSize]);

  useEffect(() => {
    return () => {
      void cleanupSession({ stopRecorder: true, discardRecording: true });
      if (annotatedReplayUrl) URL.revokeObjectURL(annotatedReplayUrl);
      if (rawReplayUrl) URL.revokeObjectURL(rawReplayUrl);
    };
  }, [annotatedReplayUrl, cleanupSession, rawReplayUrl]);

  const requestPreview = useCallback(async () => {
    setErrorMessage(null);
    setStatus("requesting-permission");

    try {
      await cleanupSession({ stopRecorder: true, discardRecording: true });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: isRearCamera ? { ideal: "environment" } : { ideal: "user" } },
        audio: false
      });
      liveStreamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        await previewVideoRef.current.play();
      }
      setStatus("preview-ready");
    } catch (error) {
      const classified = classifyCameraError(error);
      setStatus(classified);
      setErrorMessage(
        classified === "denied"
          ? "Camera permission was denied. Allow camera access and retry."
          : classified === "unsupported"
            ? "No usable camera found on this device/browser."
            : "Unable to start camera preview."
      );
    }
  }, [cleanupSession, isRearCamera]);

  const startSession = useCallback(async () => {
    const stream = liveStreamRef.current;
    const video = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (!stream || !video || !canvas) return;

    setStatus("live-session-running");
    setReplayState("idle");
    setLiveTrace(null);
    setSelectedMarkerId(null);
    setErrorMessage(null);
    if (annotatedReplayUrl) {
      URL.revokeObjectURL(annotatedReplayUrl);
      setAnnotatedReplayUrl(null);
    }
    if (rawReplayUrl) {
      URL.revokeObjectURL(rawReplayUrl);
      setRawReplayUrl(null);
    }

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

    syncOverlayCanvasSize();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastSampleAt = -LIVE_SAMPLE_INTERVAL_MS;
    const draw = () => {
      if (!previewVideoRef.current || !landmarkerRef.current || !traceRef.current) {
        return;
      }

      const elapsedMs = performance.now() - startedAtRef.current;
      syncOverlayCanvasSize();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (elapsedMs - lastSampleAt >= LIVE_SAMPLE_INTERVAL_MS) {
        const mediaTimeMs = Math.max(mediaStartMsRef.current, previewVideoRef.current.currentTime * 1000);
        const traceTimestampMs = Math.max(0, Math.round(mediaTimeMs - mediaStartMsRef.current));
        const result = landmarkerRef.current.detectForVideo(previewVideoRef.current, mediaTimeMs);
        const landmarks = result.landmarks?.[0];
        if (landmarks) {
          const frame = mapLandmarksToPoseFrame(landmarks, traceTimestampMs);
          traceRef.current.pushFrame(frame);
          drawPoseOverlay(ctx, canvas.width, canvas.height, frame);
        }
        lastSampleAt = elapsedMs;
      }

      drawAnalysisOverlay(ctx, canvas.width, canvas.height, null, {
        modeLabel: `LIVE · ${selection.drillBindingLabel}`,
        showDrillMetrics: false,
        confidenceLabel: `${LIVE_OVERLAY_CADENCE_FPS} FPS overlay cadence`
      });

      liveLoopRef.current = requestAnimationFrame(draw);
    };

    draw();
  }, [annotatedReplayUrl, rawReplayUrl, selection, syncOverlayCanvasSize]);

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

    const analysisSession = buildAnalysisSessionFromLiveTrace(trace);
    const rawFile = new File([raw.blob], `${trace.traceId}.webm`, { type: raw.mimeType });

    try {
      const annotated = await exportAnnotatedReplayFromLiveTrace({ rawVideo: rawFile, trace, analysisSession });
      const annotatedUrl = URL.createObjectURL(annotated.blob);
      setAnnotatedReplayUrl(annotatedUrl);
      setReplayState("annotated-ready");
    } catch {
      setReplayState("raw-fallback");
      setErrorMessage("Annotated replay generation failed. Showing raw session recording fallback.");
    }

    setStatus("completed");
  }, [cleanupSession]);

  return (
    <section className="panel-content" style={{ display: "grid", gap: "0.9rem" }}>
      <article className="card" style={{ display: "grid", gap: "0.8rem" }}>
        <h2 style={{ margin: 0 }}>Live Streaming</h2>
        <p className="muted" style={{ margin: 0 }}>
          Mobile browser camera session with lightweight live overlay at {LIVE_OVERLAY_CADENCE_FPS} FPS, raw recording in parallel, and post-session annotated replay from retained trace + recording.
        </p>
        <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
          <label style={{ display: "grid", gap: "0.3rem" }}>
            <span>Mode</span>
            <select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} disabled={status === "live-session-running"}>
              <option value={FREESTYLE_KEY}>No drill · Freestyle</option>
              {drillOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: "0.3rem" }}>
            <span>Camera</span>
            <button type="button" className="studio-button" onClick={() => setIsRearCamera((current) => !current)} disabled={status === "live-session-running"}>
              {isRearCamera ? "Rear camera" : "Front camera"}
            </button>
          </label>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" className="studio-button studio-button-primary" onClick={() => void requestPreview()} disabled={status === "requesting-permission" || status === "live-session-running"}>
            {status === "requesting-permission" ? "Requesting…" : "Open camera preview"}
          </button>
          <button type="button" className="studio-button studio-button-primary" onClick={() => void startSession()} disabled={status !== "preview-ready"}>
            Start live session
          </button>
          <button type="button" className="studio-button studio-button-danger" onClick={() => void stopSession()} disabled={status !== "live-session-running"}>
            Stop + finalize
          </button>
          <button type="button" className="studio-button" onClick={() => void cleanupSession({ stopRecorder: true, discardRecording: true, nextStatus: "idle" })}>
            Cancel / retake
          </button>
        </div>
        {errorMessage ? <p style={{ margin: 0, color: "#f2bbbb" }}>{errorMessage}</p> : null}
      </article>

      <article className="card" style={{ display: "grid", gap: "0.7rem" }}>
        <div style={{ position: "relative", borderRadius: "0.8rem", overflow: "hidden", border: "1px solid var(--border)" }}>
          <video ref={previewVideoRef} muted playsInline style={{ width: "100%", display: status === "completed" ? "none" : "block" }} />
          <canvas ref={previewCanvasRef} style={{ width: "100%", display: status === "live-session-running" ? "block" : "none" }} />
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

            <section style={{ display: "grid", gap: "0.45rem" }}>
              <strong>Next actions</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {annotatedReplayUrl ? (
                  <button type="button" className="studio-button studio-button-primary" onClick={() => triggerDownload(annotatedReplayUrl, `${liveTrace.traceId}-annotated.webm`)}>
                    Save annotated replay
                  </button>
                ) : null}
                {rawReplayUrl ? (
                  <button type="button" className="studio-button" onClick={() => triggerDownload(rawReplayUrl, `${liveTrace.traceId}-raw.webm`)}>
                    Save raw recording
                  </button>
                ) : null}
                <button type="button" className="studio-button" onClick={() => void requestPreview()} disabled={status === "requesting-permission" || status === "live-session-running"}>
                  Start another live session
                </button>
              </div>
            </section>
          </>
        ) : null}
      </article>
    </section>
  );
}
