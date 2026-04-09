"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listHostedLibrary } from "@/lib/hosted/library-repository";
import { loadDraft, loadDraftList } from "@/lib/persistence/local-draft-store";
import { resolveSelectedDrillKey } from "@/lib/upload/drill-selection";
import { createPoseLandmarkerForJob, mapLandmarksToPoseFrame } from "@/lib/upload/pose-landmarker";
import { drawAnalysisOverlay, drawPoseOverlay } from "@/lib/upload/overlay";
import {
  classifyCameraError,
  createLiveTraceAccumulator,
  createMediaRecorder,
  exportAnnotatedReplayFromLiveTrace,
  getCameraSupportStatus,
  stopMediaStream,
  type LiveDrillSelection,
  type LiveSessionStatus
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

export function LiveStreamingWorkspace() {
  const { session, isConfigured } = useAuth();
  const [status, setStatus] = useState<LiveSessionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [drillOptions, setDrillOptions] = useState<DrillSelectionOption[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>(FREESTYLE_KEY);
  const [isRearCamera, setIsRearCamera] = useState(true);
  const [sessionSummary, setSessionSummary] = useState<{ reps: number; holdMs: number; durationMs: number } | null>(null);
  const [replayUrl, setReplayUrl] = useState<string | null>(null);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
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

  const refreshDrillOptions = useCallback(async () => {
    const options: DrillSelectionOption[] = [];
    try {
      const local = await loadDraftList();
      for (const summary of local.slice(0, 20)) {
        const loaded = await loadDraft(summary.draftId);
        const drill = loaded?.record.packageJson.drills[0];
        if (!drill) continue;
        options.push({
          key: `local:${summary.draftId}:${drill.drillId}`,
          label: drill.title,
          sourceKind: "local",
          sourceId: summary.draftId,
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
    if (options?.nextStatus) {
      setStatus(options.nextStatus);
    }
  }, []);

  useEffect(() => {
    return () => {
      void cleanupSession({ stopRecorder: true, discardRecording: true });
      if (replayUrl) URL.revokeObjectURL(replayUrl);
    };
  }, [cleanupSession, replayUrl]);

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
    setSessionSummary(null);
    if (replayUrl) {
      URL.revokeObjectURL(replayUrl);
      setReplayUrl(null);
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

    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastSampleAt = -LIVE_SAMPLE_INTERVAL_MS;
    const draw = () => {
      if (!previewVideoRef.current || !landmarkerRef.current || !traceRef.current) {
        return;
      }

      const elapsedMs = performance.now() - startedAtRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(previewVideoRef.current, 0, 0, canvas.width, canvas.height);

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
  }, [replayUrl, selection]);

  const stopSession = useCallback(async () => {
    if (!recorderRef.current || !traceRef.current || !previewVideoRef.current) return;
    setStatus("stopping-finalizing");

    const recorder = recorderRef.current;
    const traceAccumulator = traceRef.current;
    const captureStopPerfNowMs = performance.now();
    const mediaStopMs = Math.max(mediaStartMsRef.current, previewVideoRef.current.currentTime * 1000);
    const raw = await recorder.stop();
    if (!raw) {
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

    const analysisSession = buildAnalysisSessionFromLiveTrace(trace);
    const rawFile = new File([raw.blob], `${trace.traceId}.webm`, { type: raw.mimeType });
    const annotated = await exportAnnotatedReplayFromLiveTrace({ rawVideo: rawFile, trace, analysisSession });
    const url = URL.createObjectURL(annotated.blob);

    setReplayUrl(url);
    setSessionSummary({
      reps: trace.summary.repCount ?? 0,
      holdMs: trace.summary.holdDurationMs ?? 0,
      durationMs: metadata.durationMs
    });
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
        <span className="pill">State: {status}</span>
      </article>

      <article className="card" style={{ display: "grid", gap: "0.7rem" }}>
        <div style={{ position: "relative", borderRadius: "0.8rem", overflow: "hidden", border: "1px solid var(--border)" }}>
          <video ref={previewVideoRef} muted playsInline style={{ width: "100%", display: status === "completed" ? "none" : "block" }} />
          <canvas ref={previewCanvasRef} style={{ width: "100%", display: status === "live-session-running" ? "block" : "none" }} />
        </div>
        {sessionSummary ? (
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <strong>Session complete</strong>
            <span className="muted">Duration: {Math.round(sessionSummary.durationMs / 1000)}s · Reps: {sessionSummary.reps} · Hold: {Math.round(sessionSummary.holdMs / 1000)}s</span>
            {replayUrl ? <video controls src={replayUrl} style={{ width: "100%", borderRadius: "0.8rem" }} /> : null}
          </div>
        ) : null}
      </article>
    </section>
  );
}
