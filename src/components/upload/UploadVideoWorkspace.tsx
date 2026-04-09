"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listHostedLibrary } from "@/lib/hosted/library-repository";
import { deriveReplayOverlayStateAtTime } from "@/lib/analysis/replay-state";
import { drawAnalysisOverlay, drawPoseOverlay, getNearestPoseFrame } from "@/lib/upload/overlay";
import { buildAnalysisSummary, exportAnnotatedVideo, processVideoFile, readVideoMetadata } from "@/lib/upload/processing";
import { fitVideoContainRect } from "@/lib/upload/video-layout";
import type { UploadJob } from "@/lib/upload/types";
import { loadDraft, loadDraftList } from "@/lib/persistence/local-draft-store";
import { createUploadJobDrillSelection, resolveSelectedDrillKey } from "@/lib/upload/drill-selection";
import { buildCompletedUploadAnalysisSession, type AnalysisSessionRecord } from "@/lib/analysis";
import { formatDurationShort } from "@/lib/format/duration";
import type { PortableDrill } from "@/lib/schema/contracts";
import { DrillSelectionPreviewPanel, buildDrillOptionLabel } from "@/components/upload/DrillSelectionPreviewPanel";

const DEFAULT_CADENCE_FPS = 12;
const SELECTED_DRILL_STORAGE_KEY = "upload.selected-drill";
const TRACE_STEP_OPTIONS = [100, 500, 1000] as const;
const FREESTYLE_DRILL_KEY = "freestyle";

type DrillSelectionOption = {
  key: string;
  label: string;
  sourceKind: "local" | "hosted";
  sourceId?: string;
  packageVersion?: string;
  drill: PortableDrill;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(durationMs?: number): string {
  if (durationMs === undefined || durationMs === null) {
    return "Unknown";
  }
  return formatDurationShort(durationMs);
}

function formatConfidence(value?: number): string {
  if (typeof value !== "number") {
    return "n/a";
  }
  return `${Math.round(value * 100)}%`;
}

function formatTraceStepLabel(stepMs: number): string {
  return `${(stepMs / 1000).toFixed(1)}s`;
}

function buildPhaseLabelMap(drill?: PortableDrill | null): Record<string, string> {
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

function summarizeTrace(session: AnalysisSessionRecord, stepMs: number): Array<{ timestampMs: number; phase: string; confidence: number; repCount: number }> {
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
      phase: nearest?.classifiedPhaseId ?? "none",
      confidence: nearest?.confidence ?? 0,
      repCount
    });
  }

  return rows;
}

function isMeaningfullyVariant(traceRows: Array<{ phase: string; repCount: number }>): boolean {
  const uniquePhases = new Set(traceRows.map((row) => row.phase));
  const uniqueRepCounts = new Set(traceRows.map((row) => row.repCount));
  return uniquePhases.size > 1 || uniqueRepCounts.size > 1;
}

export function UploadVideoWorkspace() {
  const { session, isConfigured, persistenceMode } = useAuth();
  const [activeJob, setActiveJob] = useState<UploadJob | null>(null);
  const [activeSession, setActiveSession] = useState<AnalysisSessionRecord | null>(null);
  const [cadenceFps, setCadenceFps] = useState(DEFAULT_CADENCE_FPS);
  const [traceStepMs, setTraceStepMs] = useState<number>(1000);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeAbortRef = useRef<AbortController | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [drillOptions, setDrillOptions] = useState<DrillSelectionOption[]>([]);
  const [selectedDrillKey, setSelectedDrillKey] = useState<string>(FREESTYLE_DRILL_KEY);
  const [drillOptionsLoading, setDrillOptionsLoading] = useState(true);
  const [isReferencePanelVisible, setIsReferencePanelVisible] = useState(true);

  const selectedDrill = useMemo(
    () => (selectedDrillKey === FREESTYLE_DRILL_KEY ? null : drillOptions.find((option) => option.key === selectedDrillKey) ?? null),
    [drillOptions, selectedDrillKey]
  );

  const refreshDrillOptions = useCallback(async () => {
    setDrillOptionsLoading(true);
    const options: DrillSelectionOption[] = [];

    try {
      const localSummaries = await loadDraftList();
      for (const summary of localSummaries.slice(0, 20)) {
        const loaded = await loadDraft(summary.draftId);
        const drill = loaded?.record.packageJson.drills[0];
        if (!drill) continue;
        options.push({
          key: `local:${summary.draftId}:${drill.drillId}`,
          label: buildDrillOptionLabel(drill),
          sourceKind: "local",
          sourceId: summary.draftId,
          packageVersion: loaded.record.packageJson.manifest.packageVersion,
          drill
        });
      }
    } catch {
      // local drill list is optional
    }

    if (session && isConfigured) {
      const hostedResult = await listHostedLibrary(session);
      if (hostedResult.ok) {
        for (const item of hostedResult.value) {
          const drill = item.content.drills[0];
          if (!drill) continue;
          options.push({
            key: `hosted:${item.id}:${drill.drillId}`,
            label: buildDrillOptionLabel(drill),
            sourceKind: "hosted",
            sourceId: item.id,
            packageVersion: item.packageVersion,
            drill
          });
        }
      }
    }

    setDrillOptions(options);
    setSelectedDrillKey((current) => {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(SELECTED_DRILL_STORAGE_KEY) : null;
      const resolved = resolveSelectedDrillKey(options, current, stored);
      return resolved ?? FREESTYLE_DRILL_KEY;
    });
    setDrillOptionsLoading(false);
  }, [isConfigured, session]);

  useEffect(() => {
    void refreshDrillOptions();
  }, [refreshDrillOptions]);

  useEffect(() => {
    if (!selectedDrillKey) return;
    window.localStorage.setItem(SELECTED_DRILL_STORAGE_KEY, selectedDrillKey);
  }, [selectedDrillKey]);

  useEffect(() => {
    if (!activeJob) {
      setPreviewObjectUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
      return;
    }

    const url = URL.createObjectURL(activeJob.file);
    setPreviewObjectUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return url;
    });

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [activeJob]);

  useEffect(() => {
    const video = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    const container = fullscreenContainerRef.current;
    if (!video || !canvas || !container || !activeJob?.artefacts || !previewObjectUrl) {
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

      const currentMs = video.currentTime * 1000;
      const frame = getNearestPoseFrame(activeJob.artefacts?.poseTimeline.frames ?? [], currentMs);
      ctx.save();
      ctx.translate(videoRect.offsetX, videoRect.offsetY);
      // Intentionally draw only once in rendered video-space (not full canvas/device pixels)
      // to avoid duplicate/ghost overlays on high-DPR screens.
      drawPoseOverlay(ctx, videoRect.renderedWidth, videoRect.renderedHeight, frame);
      if ((activeJob.drillSelection.mode ?? "drill") === "drill" && activeSession) {
        drawAnalysisOverlay(ctx, videoRect.renderedWidth, videoRect.renderedHeight, deriveReplayOverlayStateAtTime(activeSession, currentMs), {
          modeLabel: activeJob.drillSelection.drillBinding.drillName,
          showDrillMetrics: true,
          phaseLabels: buildPhaseLabelMap(activeJob.drillSelection.drill)
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
  }, [activeJob, activeSession, previewObjectUrl]);

  const startSingleRun = useCallback(async (file: File) => {
    const metadata = await readVideoMetadata(file);
    const jobId = crypto.randomUUID();
    const nextJob: UploadJob = {
      id: jobId,
      file,
      fileName: file.name,
      fileSizeBytes: file.size,
      durationMs: metadata.durationMs,
      status: "processing",
      stageLabel: "Initializing MediaPipe Pose Landmarker",
      progress: 0,
      createdAtIso: new Date().toISOString(),
      startedAtIso: new Date().toISOString(),
      drillSelection: createUploadJobDrillSelection({ selectedDrill })
    };

    setActiveSession(null);
    setIsReferencePanelVisible(false);
    setActiveJob(nextJob);

    const controller = new AbortController();
    activeAbortRef.current = controller;

    try {
      const { timeline, analysisFile, analysisSourceKind } = await processVideoFile(nextJob.file, {
        cadenceFps,
        signal: controller.signal,
        onProgress: (progress, stageLabel) => setActiveJob((current) => (current ? { ...current, progress, stageLabel } : current))
      });

      const completedSession = (nextJob.drillSelection.mode ?? "drill") === "drill" && nextJob.drillSelection.drill
        ? buildCompletedUploadAnalysisSession({
            drill: nextJob.drillSelection.drill,
            drillVersion: nextJob.drillSelection.drillVersion,
            drillBinding: {
              drillId: nextJob.drillSelection.drill.drillId,
              drillName: nextJob.drillSelection.drillBinding.drillName,
              drillVersion: nextJob.drillSelection.drillVersion,
              sourceKind: nextJob.drillSelection.drillBinding.sourceKind === "freestyle" ? "unknown" : nextJob.drillSelection.drillBinding.sourceKind,
              sourceId: nextJob.drillSelection.drillBinding.sourceId,
              sourceLabel: nextJob.drillSelection.drillBinding.sourceLabel
            },
            timeline,
            sourceId: nextJob.id,
            sourceLabel: nextJob.fileName,
            sourceUri: createUploadSourceUri(nextJob.id, nextJob.fileName),
            annotatedVideoUri: createUploadSourceUri(nextJob.id, `${createArtifactBaseName(nextJob.fileName)}.annotated-video.webm`)
          })
        : null;

      setActiveJob((current) => (current ? {
        ...current,
        progress: 0.97,
        stageLabel: analysisSourceKind === "normalized" ? "Rendering annotated video (normalized source)" : "Rendering annotated video"
      } : current));

      const overlayOptions = {
        includeAnalysisOverlay: true,
        analysisSession: completedSession,
        overlayModeLabel: (nextJob.drillSelection.mode ?? "drill") === "drill"
          ? nextJob.drillSelection.drillBinding.drillName
          : "No drill · Freestyle overlay",
        includeDrillMetrics: (nextJob.drillSelection.mode ?? "drill") === "drill",
        phaseLabels: buildPhaseLabelMap(nextJob.drillSelection.drill)
      };

      let annotated: Awaited<ReturnType<typeof exportAnnotatedVideo>>;
      try {
        annotated = await exportAnnotatedVideo(nextJob.file, timeline, overlayOptions);
      } catch (error) {
        if (analysisSourceKind !== "normalized") {
          throw error;
        }
        console.info("[upload-processing] ANNOTATED_EXPORT_FALLBACK_NORMALIZED_SOURCE", {
          fileName: nextJob.fileName,
          reason: error instanceof Error ? error.message : "unknown"
        });
        annotated = await exportAnnotatedVideo(analysisFile, timeline, overlayOptions);
      }

      setActiveJob((current) =>
        current
          ? {
              ...current,
              status: "completed",
              progress: 1,
              stageLabel: "Completed",
              completedAtIso: new Date().toISOString(),
              artefacts: {
                poseTimeline: timeline,
                processingSummary: buildAnalysisSummary(timeline),
                annotatedVideoBlob: annotated.blob,
                annotatedVideoMimeType: annotated.mimeType
              }
            }
          : current
      );
      setActiveSession(completedSession);
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      const message = error instanceof Error ? error.message : "Upload processing failed";
      setActiveJob((current) =>
        current
          ? {
              ...current,
              status: cancelled ? "cancelled" : "failed",
              stageLabel: cancelled ? "Cancelled" : "Failed",
              errorMessage: cancelled
                ? "Processing was cancelled for this video."
                : message === "Video preprocessing failed"
                  ? "Video preprocessing failed"
                  : "Processing failed. Retry to start a fresh local processing context.",
              errorDetails: message
            }
          : current
      );
    } finally {
      activeAbortRef.current = null;
    }
  }, [cadenceFps, selectedDrill]);

  const enqueueFiles = useCallback(async (files: FileList | File[]) => {
    const firstVideo = Array.from(files).find((file) => file.type.startsWith("video/"));
    if (!firstVideo) return;
    await startSingleRun(firstVideo);
  }, [startSingleRun]);

  const traceRows = useMemo(() => {
    if (!activeSession) return [];
    return summarizeTrace(activeSession, traceStepMs);
  }, [activeSession, traceStepMs]);

  const hasActiveUpload = activeJob?.status === "processing";
  const hasCompletedResult = activeJob?.status === "completed" && Boolean(activeJob.artefacts);
  const shouldCollapseReferencePanel = hasActiveUpload || hasCompletedResult;
  const showReferencePanel = isReferencePanelVisible;
  const referenceToggleLabel = showReferencePanel ? "Hide reference animation" : "Show reference animation";

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

      <div className={`upload-workflow-layout${showReferencePanel ? "" : " upload-workflow-layout--collapsed"}`}>
        <div className="upload-workflow-primary">
          <div className="card upload-workflow-action-card" style={{ margin: 0 }}>
            <div style={{ display: "grid", gap: "0.65rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.55rem", alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ fontSize: "0.95rem" }}>Upload Video workflow</strong>
                <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: "0.45rem 0.75rem", fontSize: "0.86rem" }}>
                  Choose video
                </button>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.55rem", alignItems: "center", flexWrap: "wrap" }}>
                <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                  {shouldCollapseReferencePanel
                    ? "Upload is active. Video and processing stay in the main workspace."
                    : "Reference animation is optional while you set up the upload."}
                </p>
                <button
                  type="button"
                  className="pill"
                  onClick={() => setIsReferencePanelVisible((current) => !current)}
                  aria-expanded={showReferencePanel}
                >
                  {referenceToggleLabel}
                </button>
              </div>

              <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
                <label className="muted" style={{ fontSize: "0.85rem" }}>
                  Analysis mode
                  <select
                    value={selectedDrillKey}
                    onChange={(event) => setSelectedDrillKey(event.target.value)}
                    style={{ marginLeft: "0.35rem", minWidth: 240 }}
                    disabled={drillOptionsLoading}
                  >
                    <option value={FREESTYLE_DRILL_KEY}>No drill · Freestyle overlay</option>
                    {drillOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
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
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                role="button"
                tabIndex={0}
                className="card upload-workflow-dropzone"
                style={{ margin: 0 }}
              >
                <strong>Drop a video here or click to upload</strong>
                <p className="muted" style={{ margin: "0.35rem 0 0" }}>A new upload replaces the previous run on this page.</p>
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
                onChange={(event) => event.target.files && enqueueFiles(event.target.files)}
              />
            </div>
          </div>

          {activeJob ? (
            <article className="card" style={{ margin: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                <div>
                  <strong>{activeJob.fileName}</strong>
                  <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                    {formatBytes(activeJob.fileSizeBytes)} • {formatDuration(activeJob.durationMs)} • {activeJob.status}
                  </p>
                  <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                    Mode: {activeJob.drillSelection.drillBinding.drillName} ({activeJob.drillSelection.drillBinding.sourceKind})
                  </p>
                  <p className="muted" style={{ margin: "0.2rem 0 0" }}>{activeJob.stageLabel}</p>
                  {activeJob.errorMessage ? <p style={{ margin: "0.2rem 0 0", color: "#f0b47d" }}>{activeJob.errorMessage}</p> : null}
                  {activeJob.errorDetails ? (
                    <details style={{ marginTop: "0.3rem" }}>
                      <summary className="muted" style={{ cursor: "pointer" }}>Technical details</summary>
                      <pre className="muted" style={{ whiteSpace: "pre-wrap", marginTop: "0.35rem" }}>{activeJob.errorDetails}</pre>
                    </details>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "start" }}>
                  {activeJob.status === "processing" ? <button type="button" className="pill" onClick={() => activeAbortRef.current?.abort()}>Cancel</button> : null}
                  {(activeJob.status === "failed" || activeJob.status === "cancelled") ? (
                    <button type="button" className="pill" onClick={() => void startSingleRun(activeJob.file)}>Retry</button>
                  ) : null}
                  <button type="button" className="pill" onClick={() => { setActiveJob(null); setActiveSession(null); }}>Start fresh</button>
                </div>
              </div>
              <progress max={1} value={activeJob.progress} style={{ width: "100%", marginTop: "0.4rem" }} />
            </article>
          ) : null}

          {activeJob?.artefacts ? (
            <section className="card" style={{ margin: 0 }}>
              <h3 style={{ marginTop: 0 }}>Analysis result</h3>
              <div
                ref={fullscreenContainerRef}
                style={{ position: "relative", width: "100%", maxWidth: "min(100%, 1100px)", maxHeight: "72vh", aspectRatio: "16 / 9", borderRadius: "0.6rem", overflow: "hidden" }}
              >
                <video
                  ref={previewVideoRef}
                  src={previewObjectUrl ?? undefined}
                  controls
                  playsInline
                  disablePictureInPicture
                  controlsList="nofullscreen noremoteplayback"
                  style={{ width: "100%", height: "100%", objectFit: "contain", background: "#020617" }}
                />
                <canvas ref={previewCanvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
              </div>
              <div style={{ marginTop: "0.45rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                <span className="muted" style={{ fontSize: "0.82rem" }}>Use Overlay Fullscreen to keep pose + HUD visible together.</span>
                <button
                  type="button"
                  className="pill"
                  onClick={async () => {
                    if (!fullscreenContainerRef.current) return;
                    if (document.fullscreenElement) {
                      await document.exitFullscreen();
                      return;
                    }
                    await fullscreenContainerRef.current.requestFullscreen();
                  }}
                >
                  Overlay Fullscreen
                </button>
              </div>

              {activeSession && (activeJob.drillSelection.mode ?? "drill") === "drill" ? (
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
                  <span className="pill">Phase: {activeSession.events.at(-1)?.phaseId ?? "none"}</span>
                  <span className="pill">Reps: {activeSession.summary.repCount ?? 0}</span>
                  <span className="pill">Hold: {activeSession.summary.holdDurationMs ? formatDuration(activeSession.summary.holdDurationMs) : "inactive"}</span>
                  <span className="pill">Analyzed duration: {formatDuration(activeSession.summary.analyzedDurationMs)}</span>
                  <span className="pill">Confidence: {formatConfidence(activeSession.summary.confidenceAvg)}</span>
                  <span className="pill">Result: {activeSession.status}</span>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
                  <span className="pill">Mode: No drill · Freestyle overlay</span>
                  <span className="pill">Analyzed duration: {formatDuration(activeJob.artefacts.processingSummary.durationMs)}</span>
                </div>
              )}

              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
                {activeJob.artefacts.annotatedVideoBlob ? (
                  <button
                    type="button"
                    className="pill"
                    onClick={() => downloadBlob(activeJob.artefacts!.annotatedVideoBlob!, `${createArtifactBaseName(activeJob.fileName)}.annotated-video.webm`)}
                  >
                    Download Annotated Video
                  </button>
                ) : null}
                <button
                  type="button"
                  className="pill"
                  onClick={() => downloadBlob(new Blob([JSON.stringify(activeJob.artefacts?.processingSummary, null, 2)], { type: "application/json" }), `${createArtifactBaseName(activeJob.fileName)}.processing-summary.json`)}
                >
                  Download Processing Summary (.json)
                </button>
                <button
                  type="button"
                  className="pill"
                  onClick={() => downloadBlob(new Blob([JSON.stringify(activeJob.artefacts?.poseTimeline, null, 2)], { type: "application/json" }), `${createArtifactBaseName(activeJob.fileName)}.pose-timeline.json`)}
                >
                  Download Pose Timeline (.json)
                </button>
              </div>
            </section>
          ) : null}
        </div>

        {showReferencePanel ? (
          <aside className="upload-workflow-preview">
          {selectedDrill ? (
            <DrillSelectionPreviewPanel drill={selectedDrill.drill} sourceKind={selectedDrill.sourceKind} showSourceBadge compact quiet />
          ) : (
            <section className="card" style={{ margin: 0, background: "rgba(114,168,255,0.04)" }}>
              <strong style={{ fontSize: "0.9rem" }}>Freestyle overlay mode</strong>
              <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.82rem" }}>
                Upload Video will run pose overlay and export outputs without drill-specific rep, hold, or phase scoring.
              </p>
            </section>
          )}
          </aside>
        ) : null}
      </div>

      {activeSession && (activeJob?.drillSelection.mode ?? "drill") === "drill" ? (
        <details style={{ marginTop: "0.2rem", opacity: 0.88 }}>
          <summary style={{ cursor: "pointer" }}>Advanced diagnostics (optional)</summary>
          <p className="muted" style={{ marginTop: "0.35rem" }}>Use these only for deeper troubleshooting after reviewing the main result and downloads.</p>

          <details style={{ marginTop: "0.35rem", opacity: 0.95 }}>
            <summary style={{ cursor: "pointer" }}>Temporal trace</summary>
            <div style={{ marginTop: "0.4rem", display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
              <span className="muted">Granularity</span>
              <select value={traceStepMs} onChange={(event) => setTraceStepMs(Number(event.target.value))}>
                {TRACE_STEP_OPTIONS.map((option) => (
                  <option key={option} value={option}>{formatTraceStepLabel(option)}</option>
                ))}
              </select>
            </div>
            {traceRows.length === 0 ? (
              <p className="muted">No frame samples available for this run.</p>
            ) : !isMeaningfullyVariant(traceRows) ? (
              <p className="muted">No meaningful temporal changes at this interval.</p>
            ) : (
              <ol className="muted" style={{ marginBottom: "0.45rem" }}>
                {traceRows.map((row) => (
                  <li key={`trace-${row.timestampMs}`}>
                    {formatDurationShort(row.timestampMs)} • phase={row.phase} • reps={row.repCount} • confidence={row.confidence.toFixed(2)}
                  </li>
                ))}
              </ol>
            )}
          </details>

          {activeSession.events.length > 0 ? (
            <details style={{ marginTop: "0.35rem", opacity: 0.95 }}>
              <summary style={{ cursor: "pointer" }}>Events</summary>
              <ol className="muted">
                {activeSession.events.map((event) => (
                  <li key={event.eventId} style={{ marginBottom: "0.25rem" }}>
                    {event.type} @ {formatDurationShort(event.timestampMs)}
                    {event.phaseId ? ` • phase=${event.phaseId}` : ""}
                    {event.repIndex ? ` • rep=${event.repIndex}` : ""}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}

          <details style={{ marginTop: "0.35rem", opacity: 0.9 }}>
            <summary style={{ cursor: "pointer" }}>Deep inspection table</summary>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.45rem" }}>
                <thead>
                  <tr className="muted">
                    <th style={{ textAlign: "left" }}>t(s)</th>
                    <th style={{ textAlign: "left" }}>best phase</th>
                    <th style={{ textAlign: "left" }}>score</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSession.frameSamples.slice(0, 120).map((sample) => (
                    <tr key={`sample-${sample.timestampMs}`}>
                      <td>{formatDurationShort(sample.timestampMs)}</td>
                      <td>{sample.classifiedPhaseId ?? "unknown"}</td>
                      <td>{sample.confidence.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <details style={{ marginTop: "0.35rem", opacity: 0.85 }}>
            <summary style={{ cursor: "pointer" }}>Debug and pipeline details</summary>
            <p className="muted" style={{ marginTop: "0.35rem" }}>Additional diagnostics are intentionally collapsed for normal Upload Video flow.</p>
          </details>
        </details>
      ) : null}
    </section>
  );
}
