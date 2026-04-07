"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawPoseOverlay, getNearestPoseFrame } from "@/lib/upload/overlay";
import { buildAnalysisSummary, exportAnnotatedVideo, processVideoFile, readVideoMetadata } from "@/lib/upload/processing";
import type { UploadJob } from "@/lib/upload/types";
import { getPrimarySamplePackage } from "@/lib/package/samples";
import {
  createImportedAnalysisSessionCopy,
  deserializeAnalysisSession,
  deriveReplayMarkers,
  deriveReplaySessionOverview,
  deriveReplayStateAtTime,
  getBrowserAnalysisSessionRepository,
  getReplayDurationMs,
  persistCompletedUploadAnalysisSession,
  persistFailedUploadAnalysisSession,
  serializeAnalysisSession,
  type AnalysisSessionRecord
} from "@/lib/analysis";

const DEFAULT_CADENCE_FPS = 12;

type JobAction =
  | { type: "add"; jobs: UploadJob[] }
  | { type: "update"; id: string; patch: Partial<UploadJob> }
  | { type: "remove"; id: string }
  | { type: "clear" };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(durationMs?: number): string {
  if (!durationMs) {
    return "Unknown";
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function markerColor(type: string): string {
  if (type === "rep_complete") return "#89f0a5";
  if (type === "hold_start" || type === "hold_end") return "#f5c77a";
  if (type === "invalid_transition" || type === "partial_attempt") return "#f09c9c";
  return "#7fb6ff";
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

function reducer(state: UploadJob[], action: JobAction): UploadJob[] {
  if (action.type === "add") {
    return [...state, ...action.jobs];
  }
  if (action.type === "update") {
    return state.map((job) => (job.id === action.id ? { ...job, ...action.patch } : job));
  }
  if (action.type === "remove") {
    return state.filter((job) => job.id !== action.id);
  }
  return [];
}

export function UploadVideoWorkspace() {
  const analysisRepository = useMemo(() => getBrowserAnalysisSessionRepository(), []);
  const referenceDrill = useMemo(() => getPrimarySamplePackage().drills[0], []);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<AnalysisSessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [cadenceFps, setCadenceFps] = useState(DEFAULT_CADENCE_FPS);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeAbortRef = useRef<AbortController | null>(null);
  const isRunningRef = useRef(false);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [replayElapsedMs, setReplayElapsedMs] = useState(0);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? jobs.find((job) => job.status === "completed"), [jobs, selectedJobId]);
  const selectedSession = useMemo(
    () => recentSessions.find((session) => session.sessionId === selectedSessionId) ?? recentSessions[0],
    [recentSessions, selectedSessionId]
  );
  const replayDurationMs = useMemo(() => getReplayDurationMs(selectedSession), [selectedSession]);
  const replayState = useMemo(() => deriveReplayStateAtTime(selectedSession, replayElapsedMs), [selectedSession, replayElapsedMs]);
  const replayMarkers = useMemo(() => deriveReplayMarkers(selectedSession), [selectedSession]);
  const replayOverview = useMemo(() => deriveReplaySessionOverview(selectedSession), [selectedSession]);

  const dispatch = useCallback((action: JobAction) => setJobs((prev) => reducer(prev, action)), []);
  const refreshRecentSessions = useCallback(async () => {
    const sessions = await analysisRepository.listRecentSessions({ limit: 12 });
    setRecentSessions(sessions);
    setSelectedSessionId((previous) => previous ?? sessions[0]?.sessionId ?? null);
  }, [analysisRepository]);

  const enqueueFiles = useCallback(async (files: FileList | File[]) => {
    const nextJobs: UploadJob[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("video/")) {
        continue;
      }
      const metadata = await readVideoMetadata(file);
      nextJobs.push({
        id: crypto.randomUUID(),
        file,
        fileName: file.name,
        fileSizeBytes: file.size,
        durationMs: metadata.durationMs,
        status: "queued",
        stageLabel: "Ready",
        progress: 0,
        createdAtIso: new Date().toISOString()
      });
    }

    if (nextJobs.length > 0) {
      dispatch({ type: "add", jobs: nextJobs });
      setSelectedJobId(nextJobs[0].id);
    }
  }, [dispatch]);

  const runQueue = useCallback(async () => {
    if (isRunningRef.current) {
      return;
    }

    const nextJob = jobs.find((job) => job.status === "queued");
    if (!nextJob) {
      return;
    }

    isRunningRef.current = true;
    const controller = new AbortController();
    activeAbortRef.current = controller;

    dispatch({
      type: "update",
      id: nextJob.id,
      patch: { status: "processing", stageLabel: "Initializing MediaPipe Pose Landmarker", startedAtIso: new Date().toISOString() }
    });

    try {
      const timeline = await processVideoFile(nextJob.file, {
        cadenceFps,
        signal: controller.signal,
        onProgress: (progress, stageLabel) => dispatch({ type: "update", id: nextJob.id, patch: { progress, stageLabel } })
      });
      dispatch({ type: "update", id: nextJob.id, patch: { stageLabel: "Rendering annotated video", progress: 0.97 } });
      const annotated = await exportAnnotatedVideo(nextJob.file, timeline);

      dispatch({
        type: "update",
        id: nextJob.id,
        patch: {
          status: "completed",
          progress: 1,
          stageLabel: "Completed",
          errorMessage: undefined,
          errorDetails: undefined,
          completedAtIso: new Date().toISOString(),
          artefacts: {
            poseTimeline: timeline,
            processingSummary: buildAnalysisSummary(timeline),
            annotatedVideoBlob: annotated.blob,
            annotatedVideoMimeType: annotated.mimeType
          }
        }
      });
      const persisted = await persistCompletedUploadAnalysisSession({
        repository: analysisRepository,
        drill: referenceDrill,
        drillVersion: "sample-v1",
        timeline,
        sourceId: nextJob.id,
        sourceLabel: nextJob.fileName,
        sourceUri: createUploadSourceUri(nextJob.id, nextJob.fileName),
        annotatedVideoUri: createUploadSourceUri(nextJob.id, `${createArtifactBaseName(nextJob.fileName)}.annotated-video.webm`)
      });
      setSelectedSessionId(persisted.sessionId);
      await refreshRecentSessions();
      setSelectedJobId(nextJob.id);
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      const message = error instanceof Error ? error.message : "Upload processing failed";
      dispatch({
        type: "update",
        id: nextJob.id,
        patch: {
          status: cancelled ? "cancelled" : "failed",
          stageLabel: cancelled ? "Cancelled" : "Failed",
          errorMessage: cancelled ? "Processing was cancelled for this video." : "Processing failed. Retry to start a fresh local processing context.",
          errorDetails: message
        }
      });

      if (!cancelled) {
        await persistFailedUploadAnalysisSession({
          repository: analysisRepository,
          drill: referenceDrill,
          drillVersion: "sample-v1",
          sourceId: nextJob.id,
          sourceLabel: nextJob.fileName,
          sourceUri: createUploadSourceUri(nextJob.id, nextJob.fileName),
          errorMessage: message
        });
        await refreshRecentSessions();
      }
    } finally {
      activeAbortRef.current = null;
      isRunningRef.current = false;
    }
  }, [analysisRepository, cadenceFps, dispatch, jobs, referenceDrill, refreshRecentSessions]);

  useEffect(() => {
    void runQueue();
  }, [jobs, runQueue]);
  useEffect(() => {
    void refreshRecentSessions();
  }, [refreshRecentSessions]);

  useEffect(() => {
    setReplayElapsedMs(0);
    setIsReplayPlaying(false);
  }, [selectedSession?.sessionId]);

  useEffect(() => {
    if (!isReplayPlaying || replayDurationMs <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setReplayElapsedMs((current) => {
        const next = current + 100;
        if (next >= replayDurationMs) {
          setIsReplayPlaying(false);
          return replayDurationMs;
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [isReplayPlaying, replayDurationMs]);

  useEffect(() => {
    if (!selectedJob) {
      setPreviewObjectUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return null;
      });
      return;
    }

    const url = URL.createObjectURL(selectedJob.file);
    setPreviewObjectUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return url;
    });

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedJob]);

  useEffect(() => {
    const video = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (!video || !canvas || !selectedJob?.artefacts || !previewObjectUrl) {
      return;
    }

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const frame = getNearestPoseFrame(selectedJob.artefacts?.poseTimeline.frames ?? [], video.currentTime * 1000);
      drawPoseOverlay(ctx, canvas.width, canvas.height, frame);
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [previewObjectUrl, selectedJob]);

  return (
    <section className="card" style={{ marginTop: "1rem", display: "grid", gap: "0.85rem" }}>
      <div className="card" style={{ margin: 0, background: "rgba(114,168,255,0.1)" }}>
        <strong>Local processing notice</strong>
        <p className="muted" style={{ margin: "0.4rem 0 0" }}>
          Upload Video runs on this device using MediaPipe in your browser. Keep this tab open while processing. Switching tabs can slow processing, and closing/reloading stops queued jobs.
        </p>
      </div>

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="pill" onClick={() => fileInputRef.current?.click()}>Select video files</button>
        <label className="muted" style={{ fontSize: "0.85rem" }}>
          Cadence FPS
          <input type="number" min={4} max={30} value={cadenceFps} onChange={(event) => setCadenceFps(Math.max(4, Math.min(30, Number(event.target.value) || DEFAULT_CADENCE_FPS)))} style={{ marginLeft: "0.35rem", width: 70 }} />
        </label>
        <input ref={fileInputRef} type="file" accept="video/*" multiple style={{ display: "none" }} onChange={(event) => event.target.files && enqueueFiles(event.target.files)} />
      </div>

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void enqueueFiles(event.dataTransfer.files);
        }}
        className="card"
        style={{ margin: 0, borderStyle: "dashed", textAlign: "center" }}
      >
        Drag and drop video files here (multiple supported)
      </div>

      <div style={{ display: "grid", gap: "0.5rem" }}>
        {jobs.map((job) => (
          <article key={job.id} className="card" style={{ margin: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
              <div>
                <strong>{job.fileName}</strong>
                <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                  {formatBytes(job.fileSizeBytes)} • {formatDuration(job.durationMs)} • {job.status}
                </p>
                <p className="muted" style={{ margin: "0.2rem 0 0" }}>{job.stageLabel}</p>
                {job.errorMessage ? <p style={{ margin: "0.2rem 0 0", color: "#f0b47d" }}>{job.errorMessage}</p> : null}
                {job.errorDetails ? (
                  <details style={{ marginTop: "0.3rem" }}>
                    <summary className="muted" style={{ cursor: "pointer" }}>Technical details</summary>
                    <pre className="muted" style={{ whiteSpace: "pre-wrap", marginTop: "0.35rem" }}>{job.errorDetails}</pre>
                  </details>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "start" }}>
                <button type="button" className="pill" onClick={() => setSelectedJobId(job.id)}>Preview</button>
                {job.status === "queued" ? <button type="button" className="pill" onClick={() => dispatch({ type: "remove", id: job.id })}>Remove</button> : null}
                {job.status === "processing" ? <button type="button" className="pill" onClick={() => activeAbortRef.current?.abort()}>Cancel</button> : null}
                {job.status === "failed" || job.status === "cancelled" ? (
                  <button
                    type="button"
                    className="pill"
                    onClick={() => dispatch({
                      type: "update",
                      id: job.id,
                      patch: { status: "queued", progress: 0, stageLabel: "Retry queued", errorMessage: undefined, errorDetails: undefined, artefacts: undefined }
                    })}
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            </div>
            <progress max={1} value={job.progress} style={{ width: "100%", marginTop: "0.4rem" }} />
          </article>
        ))}
      </div>

      {selectedJob?.artefacts ? (
        <section className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Overlay preview</h3>
          <div style={{ position: "relative", width: "100%", maxWidth: 700 }}>
            <video ref={previewVideoRef} src={previewObjectUrl ?? undefined} controls style={{ width: "100%", borderRadius: "0.6rem" }} />
            <canvas ref={previewCanvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
          </div>
          <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
            {selectedJob.artefacts.annotatedVideoBlob ? (
              <button
                type="button"
                className="pill"
                onClick={() => downloadBlob(selectedJob.artefacts!.annotatedVideoBlob!, `${createArtifactBaseName(selectedJob.fileName)}.annotated-video.webm`)}
              >
                Download Annotated Video
              </button>
            ) : null}
            <button
              type="button"
              className="pill"
              onClick={() => downloadBlob(new Blob([JSON.stringify(selectedJob.artefacts?.processingSummary, null, 2)], { type: "application/json" }), `${createArtifactBaseName(selectedJob.fileName)}.processing-summary.json`)}
            >
              Download Processing Summary (.json)
            </button>
            <button
              type="button"
              className="pill"
              onClick={() => downloadBlob(new Blob([JSON.stringify(selectedJob.artefacts?.poseTimeline, null, 2)], { type: "application/json" }), `${createArtifactBaseName(selectedJob.fileName)}.pose-timeline.json`)}
            >
              Download Pose Timeline (.json)
            </button>
          </div>
          <div className="muted" style={{ marginTop: "0.45rem", display: "grid", gap: "0.2rem" }}>
            <span><strong>Annotated Video:</strong> video preview with pose overlay styling for playback/export.</span>
            <span><strong>Processing Summary (.json):</strong> lightweight summary metadata about this run.</span>
            <span><strong>Pose Timeline (.json):</strong> frame-by-frame pose keypoints and timestamps.</span>
          </div>
        </section>
      ) : null}

      <section className="card" style={{ margin: 0 }}>
        <h3 style={{ marginTop: 0 }}>Recent analyses</h3>
        {recentSessions.length === 0 ? <p className="muted">No persisted analysis sessions yet. Run Upload Video to create one.</p> : null}
        <div style={{ display: "grid", gap: "0.4rem" }}>
          {recentSessions.map((session) => (
            <button
              key={session.sessionId}
              type="button"
              className="pill"
              style={{
                textAlign: "left",
                borderColor: selectedSession?.sessionId === session.sessionId ? "rgba(114,168,255,0.8)" : undefined,
                background: selectedSession?.sessionId === session.sessionId ? "rgba(114,168,255,0.14)" : undefined
              }}
              onClick={() => setSelectedSessionId(session.sessionId)}
            >
              <strong>{session.drillTitle ?? session.drillId}</strong> • {new Date(session.createdAtIso).toLocaleString()} • {session.status} • reps{" "}
              {session.summary.repCount ?? 0} • duration {formatDuration(session.summary.analyzedDurationMs)}
            </button>
          ))}
        </div>
        {selectedSession ? (
          <article className="card" style={{ marginBottom: 0, marginTop: "0.75rem" }}>
            <h4 style={{ marginTop: 0 }}>Session detail</h4>
            <p className="muted" style={{ marginTop: 0 }}>
              Source: {selectedSession.sourceKind} / {selectedSession.sourceLabel ?? selectedSession.sourceId ?? "n/a"} • Pipeline:{" "}
              {selectedSession.pipelineVersion ?? "unknown"}
            </p>
            <p className="muted" style={{ marginTop: 0 }}>
              Raw URI: {selectedSession.rawVideoUri ?? selectedSession.sourceUri ?? "n/a"} • Annotated URI: {selectedSession.annotatedVideoUri ?? "n/a"}
            </p>
            <ul className="muted" style={{ marginTop: "0.2rem" }}>
              <li>Rep count: {selectedSession.summary.repCount ?? 0}</li>
              <li>Hold duration: {formatDuration(selectedSession.summary.holdDurationMs)}</li>
              <li>Analyzed duration: {formatDuration(selectedSession.summary.analyzedDurationMs)}</li>
              <li>Frame samples: {selectedSession.frameSamples.length}</li>
              <li>Events: {selectedSession.events.length}</li>
            </ul>
            <div className="card" style={{ margin: "0.7rem 0 0", background: "rgba(114,168,255,0.08)" }}>
              <h5 style={{ margin: 0 }}>Replay review</h5>
              <p className="muted" style={{ margin: "0.35rem 0 0.5rem" }}>
                {selectedSession.drillTitle ?? selectedSession.drillId} • {new Date(selectedSession.createdAtIso).toLocaleString()} • quality {replayOverview.qualityLabel}
              </p>
              <div
                style={{
                  position: "relative",
                  borderRadius: "0.5rem",
                  border: "1px solid rgba(148,163,184,0.35)",
                  padding: "0.6rem",
                  background: "rgba(15,23,42,0.5)",
                  marginBottom: "0.6rem"
                }}
              >
                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
                  <span className="pill">Phase: {replayState.activePhaseId ?? "n/a"}</span>
                  {selectedSession.summary.repCount !== undefined ? <span className="pill">Reps: {replayState.repCount}</span> : null}
                  {selectedSession.summary.holdDurationMs !== undefined ? (
                    <span className="pill">
                      Hold: {replayState.holdActive ? formatDuration(replayState.holdElapsedMs) : "inactive"}
                    </span>
                  ) : null}
                  <span className="pill">Status: {selectedSession.status}</span>
                </div>
                <p className="muted" style={{ margin: "0.45rem 0 0" }}>
                  {formatClock(replayState.timestampMs)} / {formatClock(replayDurationMs)} • nearest event: {replayState.nearestEvent?.type ?? "none"}
                </p>
              </div>

              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginBottom: "0.4rem" }}>
                <button type="button" className="pill" onClick={() => setIsReplayPlaying((current) => !current)} disabled={replayDurationMs <= 0}>
                  {isReplayPlaying ? "Pause" : "Play"}
                </button>
                <button type="button" className="pill" onClick={() => setReplayElapsedMs(0)} disabled={replayDurationMs <= 0}>Reset</button>
              </div>
              <div style={{ position: "relative", paddingTop: "0.65rem" }}>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, replayDurationMs)}
                  value={Math.min(replayElapsedMs, replayDurationMs)}
                  onChange={(event) => setReplayElapsedMs(Number(event.target.value))}
                  style={{ width: "100%" }}
                  disabled={replayDurationMs <= 0}
                />
                <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 8, pointerEvents: "none" }}>
                  {replayMarkers.map((marker) => (
                    <span
                      key={marker.eventId}
                      title={`${marker.type} @ ${(marker.timestampMs / 1000).toFixed(2)}s`}
                      style={{
                        position: "absolute",
                        left: `${replayDurationMs > 0 ? (marker.timestampMs / replayDurationMs) * 100 : 0}%`,
                        width: 2,
                        height: "100%",
                        borderRadius: 999,
                        background: markerColor(marker.type),
                        opacity: 0.85
                      }}
                    />
                  ))}
                </div>
              </div>
              {replayOverview.phaseCoverage.length > 0 ? (
                <p className="muted" style={{ margin: "0.45rem 0 0" }}>
                  Phase coverage:{" "}
                  {replayOverview.phaseCoverage
                    .slice(0, 4)
                    .map((entry) => `${entry.phaseId} ${entry.percent.toFixed(0)}%`)
                    .join(" • ")}
                </p>
              ) : null}
            </div>

            <details>
              <summary style={{ cursor: "pointer" }}>Event log</summary>
              <ol className="muted">
                {selectedSession.events.map((event) => (
                  <li key={event.eventId} style={{ marginBottom: "0.25rem" }}>
                    <button type="button" className="pill" onClick={() => setReplayElapsedMs(event.timestampMs)}>
                      {event.type} @ {(event.timestampMs / 1000).toFixed(2)}s
                      {event.phaseId ? ` • phase=${event.phaseId}` : ""}
                      {event.repIndex ? ` • rep=${event.repIndex}` : ""}
                      {typeof event.details?.["holdDurationMs"] === "number" ? ` • hold=${formatDuration(Number(event.details?.["holdDurationMs"]))}` : ""}
                      {event.toPhaseId ? ` • to=${event.toPhaseId}` : ""}
                    </button>
                  </li>
                ))}
              </ol>
            </details>

            <details>
              <summary style={{ cursor: "pointer" }}>JSON debug</summary>
              <pre className="muted" style={{ whiteSpace: "pre-wrap" }}>{serializeAnalysisSession(selectedSession)}</pre>
            </details>
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
              <button
                type="button"
                className="pill"
                onClick={() =>
                  downloadBlob(
                    new Blob([serializeAnalysisSession(selectedSession)], { type: "application/json" }),
                    `${selectedSession.sessionId}.analysis-session.json`
                  )
                }
              >
                Download Session JSON
              </button>
              <button
                type="button"
                className="pill"
                onClick={async () => {
                  const importedSession = createImportedAnalysisSessionCopy(
                    deserializeAnalysisSession(serializeAnalysisSession(selectedSession)),
                    { importedSessionId: crypto.randomUUID() }
                  );
                  await analysisRepository.saveSession(importedSession);
                  await refreshRecentSessions();
                  setSelectedSessionId(importedSession.sessionId);
                }}
              >
                Import JSON as New Session
              </button>
            </div>
          </article>
        ) : null}
      </section>
    </section>
  );
}
