"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { drawPoseOverlay, getNearestPoseFrame } from "@/lib/upload/overlay";
import { buildAnalysisSummary, exportAnnotatedVideo, processVideoFile, readVideoMetadata } from "@/lib/upload/processing";
import type { UploadJob } from "@/lib/upload/types";

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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
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
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [cadenceFps, setCadenceFps] = useState(DEFAULT_CADENCE_FPS);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeAbortRef = useRef<AbortController | null>(null);
  const isRunningRef = useRef(false);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? jobs.find((job) => job.status === "completed"), [jobs, selectedJobId]);

  const dispatch = useCallback((action: JobAction) => setJobs((prev) => reducer(prev, action)), []);

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
          completedAtIso: new Date().toISOString(),
          artefacts: {
            poseTimeline: timeline,
            analysis: buildAnalysisSummary(timeline),
            annotatedVideoBlob: annotated.blob,
            annotatedVideoMimeType: annotated.mimeType
          }
        }
      });
      setSelectedJobId(nextJob.id);
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      dispatch({
        type: "update",
        id: nextJob.id,
        patch: {
          status: cancelled ? "cancelled" : "failed",
          stageLabel: cancelled ? "Cancelled" : "Failed",
          errorMessage: error instanceof Error ? error.message : "Upload processing failed"
        }
      });
    } finally {
      activeAbortRef.current = null;
      isRunningRef.current = false;
    }
  }, [cadenceFps, dispatch, jobs]);

  useEffect(() => {
    void runQueue();
  }, [jobs, runQueue]);

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
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "start" }}>
                <button type="button" className="pill" onClick={() => setSelectedJobId(job.id)}>Preview</button>
                {job.status === "queued" ? <button type="button" className="pill" onClick={() => dispatch({ type: "remove", id: job.id })}>Remove</button> : null}
                {job.status === "processing" ? <button type="button" className="pill" onClick={() => activeAbortRef.current?.abort()}>Cancel</button> : null}
                {job.status === "failed" || job.status === "cancelled" ? (
                  <button type="button" className="pill" onClick={() => dispatch({ type: "update", id: job.id, patch: { status: "queued", progress: 0, stageLabel: "Retry queued", errorMessage: undefined } })}>Retry</button>
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
            <button
              type="button"
              className="pill"
              onClick={() => downloadBlob(new Blob([JSON.stringify(selectedJob.artefacts?.poseTimeline, null, 2)], { type: "application/json" }), `${selectedJob.fileName}.pose-timeline.json`)}
            >
              Download pose timeline JSON
            </button>
            <button
              type="button"
              className="pill"
              onClick={() => downloadBlob(new Blob([JSON.stringify(selectedJob.artefacts?.analysis, null, 2)], { type: "application/json" }), `${selectedJob.fileName}.analysis.json`)}
            >
              Download analysis JSON
            </button>
            {selectedJob.artefacts.annotatedVideoBlob ? (
              <button
                type="button"
                className="pill"
                onClick={() => downloadBlob(selectedJob.artefacts!.annotatedVideoBlob!, `${selectedJob.fileName}.annotated.webm`)}
              >
                Download annotated video (WebM)
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </section>
  );
}
