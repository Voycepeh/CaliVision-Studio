"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listHostedLibrary } from "@/lib/hosted/library-repository";
import { drawPoseOverlay, getNearestPoseFrame } from "@/lib/upload/overlay";
import { buildAnalysisSummary, exportAnnotatedVideo, processVideoFile, readVideoMetadata } from "@/lib/upload/processing";
import type { UploadJob } from "@/lib/upload/types";
import { getPrimarySamplePackage, listSeededSampleDrills } from "@/lib/package/samples";
import { loadDraft, loadDraftList } from "@/lib/persistence/local-draft-store";
import { createUploadJobDrillSelection, resolveSelectedDrillKey } from "@/lib/upload/drill-selection";
import { getPrimarySamplePackage } from "@/lib/package/samples";
import { listReadyDrillsForUpload } from "@/lib/library";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  createAnalysisArtifactFilename,
  createImportedAnalysisSessionCopy,
  deriveReplayMarkers,
  deriveReplaySessionOverview,
  deriveReplayStateAtTime,
  getBrowserAnalysisSessionRepository,
  getReplayDurationMs,
  persistCompletedUploadAnalysisSession,
  persistFailedUploadAnalysisSession,
  serializeAnalysisSessionArtifact,
  type AnalysisSessionRecord
} from "@/lib/analysis";
import {
  findLatestSessionForUpload,
  getLifecycleLabel,
  getSessionOutcomeLabel,
  getSessionStatusTone,
  getUploadLifecycleState,
  summarizeSessionAvailability
} from "@/lib/upload/analysis-session-ux";

const DEFAULT_CADENCE_FPS = 12;
const SELECTED_DRILL_STORAGE_KEY = "upload.selected-drill";

type DrillSelectionOption = {
  key: string;
  label: string;
  sourceKind: "seeded" | "local" | "hosted";
  sourceId?: string;
  packageVersion?: string;
  drill: ReturnType<typeof getPrimarySamplePackage>["drills"][number];
};

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

function toneStyles(tone: "good" | "warn" | "bad" | "neutral"): { border: string; background: string } {
  if (tone === "good") {
    return { border: "rgba(121, 216, 152, 0.65)", background: "rgba(34, 92, 55, 0.35)" };
  }
  if (tone === "warn") {
    return { border: "rgba(244, 191, 88, 0.7)", background: "rgba(110, 74, 20, 0.33)" };
  }
  if (tone === "bad") {
    return { border: "rgba(248, 113, 113, 0.7)", background: "rgba(120, 35, 40, 0.33)" };
  }
  return { border: "rgba(148,163,184,0.45)", background: "rgba(15,23,42,0.35)" };
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

type ReadyUploadDrill = Awaited<ReturnType<typeof listReadyDrillsForUpload>>[number];

export function UploadVideoWorkspace() {
  const { persistenceMode, session } = useAuth();
  const analysisRepository = useMemo(() => getBrowserAnalysisSessionRepository(), []);
  const { session, isConfigured } = useAuth();
  const fallbackDrill = useMemo(() => getPrimarySamplePackage().drills[0], []);
  const fallbackDrill = useMemo(() => getPrimarySamplePackage().drills[0], []);
  const [readyDrills, setReadyDrills] = useState<ReadyUploadDrill[] | null>(null);
  const [selectedReadyDrillId, setSelectedReadyDrillId] = useState<string | null>(null);
  const selectedReadyDrill = useMemo(
    () => readyDrills?.find((drill) => drill.drillId === selectedReadyDrillId) ?? readyDrills?.[0] ?? null,
    [readyDrills, selectedReadyDrillId]
  );
  const referenceDrill = selectedReadyDrill?.packageJson.drills[0] ?? fallbackDrill;
  const hasReadyDrills = (readyDrills?.length ?? 0) > 0;
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
  const [drillOptions, setDrillOptions] = useState<DrillSelectionOption[]>([]);
  const [selectedDrillKey, setSelectedDrillKey] = useState<string | null>(null);
  const [drillOptionsLoading, setDrillOptionsLoading] = useState(true);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? jobs.find((job) => job.status === "completed"), [jobs, selectedJobId]);
  const selectedSession = useMemo(
    () => recentSessions.find((session) => session.sessionId === selectedSessionId) ?? recentSessions[0],
    [recentSessions, selectedSessionId]
  );
  const selectedJobLinkedSession = useMemo(
    () => findLatestSessionForUpload(recentSessions, selectedJob?.id),
    [recentSessions, selectedJob?.id]
  );
  const selectedDrill = useMemo(
    () => drillOptions.find((option) => option.key === selectedDrillKey) ?? null,
    [drillOptions, selectedDrillKey]
  );
  const drillSessions = useMemo(
    () => recentSessions.filter((session) => session.drillId === (selectedDrill?.drill.drillId ?? fallbackDrill.drillId)),
    [recentSessions, selectedDrill?.drill.drillId, fallbackDrill.drillId]
  );
  const replayDurationMs = useMemo(() => getReplayDurationMs(selectedSession), [selectedSession]);
  const replayState = useMemo(() => deriveReplayStateAtTime(selectedSession, replayElapsedMs), [selectedSession, replayElapsedMs]);
  const replayMarkers = useMemo(() => deriveReplayMarkers(selectedSession), [selectedSession]);
  const replayOverview = useMemo(() => deriveReplaySessionOverview(selectedSession), [selectedSession]);
  const isReplayBoundToPreview = useMemo(
    () => Boolean(selectedSession && selectedJob?.artefacts && selectedSession.sourceId === selectedJob.id),
    [selectedSession, selectedJob]
  );

  const dispatch = useCallback((action: JobAction) => setJobs((prev) => reducer(prev, action)), []);
  const refreshDrillOptions = useCallback(async () => {
    setDrillOptionsLoading(true);
    const options: DrillSelectionOption[] = listSeededSampleDrills().map((entry) => ({
      key: `seeded:${entry.drill.drillId}:${entry.packageVersion}`,
      label: entry.drill.title,
      sourceKind: "seeded",
      sourceId: entry.packageId,
      packageVersion: entry.packageVersion,
      drill: entry.drill
    }));

    try {
      const localSummaries = await loadDraftList();
      for (const summary of localSummaries.slice(0, 20)) {
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
    setSelectedDrillKey((current) => {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(SELECTED_DRILL_STORAGE_KEY) : null;
      return resolveSelectedDrillKey(options, current, stored);
    });
    setDrillOptionsLoading(false);
  }, [isConfigured, session]);
  const refreshRecentSessions = useCallback(async () => {
    const sessions = await analysisRepository.listRecentSessions({ limit: 12 });
    setRecentSessions(sessions);
    setSelectedSessionId((previous) => previous ?? sessions[0]?.sessionId ?? null);
  }, [analysisRepository]);

  const enqueueFiles = useCallback(async (files: FileList | File[]) => {
    const drillSelection = createUploadJobDrillSelection({ fallbackDrill, selectedDrill });
    if (!hasReadyDrills) {
      return;
    }
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
        createdAtIso: new Date().toISOString(),
        drillSelection
      });
    }

    if (nextJobs.length > 0) {
      dispatch({ type: "add", jobs: nextJobs });
      setSelectedJobId(nextJobs[0].id);
    }
  }, [dispatch, fallbackDrill, selectedDrill]);
  }, [dispatch, hasReadyDrills]);

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

    let persistedSession: AnalysisSessionRecord | null = null;

    try {
      const timeline = await processVideoFile(nextJob.file, {
        cadenceFps,
        signal: controller.signal,
        onProgress: (progress, stageLabel) => dispatch({ type: "update", id: nextJob.id, patch: { progress, stageLabel } })
      });
      const annotatedVideoUri = createUploadSourceUri(nextJob.id, `${createArtifactBaseName(nextJob.fileName)}.annotated-video.webm`);
      persistedSession = await persistCompletedUploadAnalysisSession({
        repository: analysisRepository,
        drill: referenceDrill,
        drillVersion: "sample-v1",
        timeline,
        sourceId: nextJob.id,
        sourceLabel: nextJob.fileName,
        sourceUri: createUploadSourceUri(nextJob.id, nextJob.fileName)
      });
      dispatch({ type: "update", id: nextJob.id, patch: { stageLabel: "Rendering annotated video", progress: 0.97 } });
      const annotated = await exportAnnotatedVideo(nextJob.file, timeline, { analysisSession: persistedSession, includeAnalysisOverlay: true });
      const linkedSession: AnalysisSessionRecord = { ...persistedSession, annotatedVideoUri };
      await analysisRepository.saveSession(linkedSession);

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
        drill: nextJob.drillSelection.drill,
        drillVersion: nextJob.drillSelection.drillVersion,
        drillBinding: nextJob.drillSelection.drillBinding,
        drill: referenceDrill,
        drillVersion: selectedReadyDrill?.versionId ?? "sample-v1",
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

      if (!cancelled && !persistedSession) {
        await persistFailedUploadAnalysisSession({
          repository: analysisRepository,
          drill: nextJob.drillSelection.drill,
          drillVersion: nextJob.drillSelection.drillVersion,
          drillBinding: nextJob.drillSelection.drillBinding,
          drill: referenceDrill,
          drillVersion: selectedReadyDrill?.versionId ?? "sample-v1",
          sourceId: nextJob.id,
          sourceLabel: nextJob.fileName,
          sourceUri: createUploadSourceUri(nextJob.id, nextJob.fileName),
          errorMessage: message
        });
      }
      await refreshRecentSessions();
    } finally {
      activeAbortRef.current = null;
      isRunningRef.current = false;
    }
  }, [analysisRepository, cadenceFps, dispatch, jobs, refreshRecentSessions]);
  }, [analysisRepository, cadenceFps, dispatch, jobs, referenceDrill, refreshRecentSessions, selectedReadyDrill?.versionId]);

  useEffect(() => {
    void runQueue();
  }, [jobs, runQueue]);
  useEffect(() => {
    void refreshRecentSessions();
  }, [refreshRecentSessions]);
  useEffect(() => {
    void refreshDrillOptions();
  }, [refreshDrillOptions]);
  useEffect(() => {
    if (!selectedDrillKey) return;
    window.localStorage.setItem(SELECTED_DRILL_STORAGE_KEY, selectedDrillKey);
  }, [selectedDrillKey]);

  useEffect(() => {
    void (async () => {
      const drills = await listReadyDrillsForUpload({ mode: persistenceMode === "cloud" ? "cloud" : "local", session });
      setReadyDrills(drills);
      setSelectedReadyDrillId((current) => current ?? drills[0]?.drillId ?? null);
    })();
  }, [persistenceMode, session]);

  useEffect(() => {
    setReplayElapsedMs(0);
    setIsReplayPlaying(false);
  }, [selectedSession?.sessionId]);

  useEffect(() => {
    if (!isReplayBoundToPreview) {
      return;
    }
    const video = previewVideoRef.current;
    if (!video) {
      return;
    }

    const syncElapsed = () => {
      setReplayElapsedMs(video.currentTime * 1000);
      setIsReplayPlaying(!video.paused && !video.ended);
    };
    const handlePlay = () => setIsReplayPlaying(true);
    const handlePause = () => setIsReplayPlaying(false);
    const handleEnded = () => {
      setIsReplayPlaying(false);
      setReplayElapsedMs(replayDurationMs);
    };

    syncElapsed();
    video.addEventListener("timeupdate", syncElapsed);
    video.addEventListener("seeked", syncElapsed);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("timeupdate", syncElapsed);
      video.removeEventListener("seeked", syncElapsed);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
    };
  }, [isReplayBoundToPreview, replayDurationMs]);

  useEffect(() => {
    if (!isReplayBoundToPreview) {
      return;
    }
    const video = previewVideoRef.current;
    if (!video) {
      return;
    }
    const targetSeconds = replayElapsedMs / 1000;
    if (Math.abs(video.currentTime - targetSeconds) > 0.12) {
      video.currentTime = targetSeconds;
    }
  }, [isReplayBoundToPreview, replayElapsedMs]);

  useEffect(() => {
    if (!isReplayPlaying || replayDurationMs <= 0 || isReplayBoundToPreview) {
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
  }, [isReplayBoundToPreview, isReplayPlaying, replayDurationMs]);

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

  const handleReplayPlayPause = useCallback(() => {
    if (replayDurationMs <= 0) {
      return;
    }
    if (isReplayBoundToPreview) {
      const video = previewVideoRef.current;
      if (!video) {
        return;
      }
      if (video.paused || video.ended) {
        void video.play();
      } else {
        video.pause();
      }
      return;
    }
    setIsReplayPlaying((current) => !current);
  }, [isReplayBoundToPreview, replayDurationMs]);

  const handleReplayReset = useCallback(() => {
    if (isReplayBoundToPreview) {
      const video = previewVideoRef.current;
      if (video) {
        video.currentTime = 0;
        video.pause();
      }
    }
    setReplayElapsedMs(0);
    setIsReplayPlaying(false);
  }, [isReplayBoundToPreview]);

  const handleReplaySeek = useCallback(
    (nextMs: number) => {
      const clampedMs = Math.max(0, Math.min(nextMs, replayDurationMs));
      if (isReplayBoundToPreview) {
        const video = previewVideoRef.current;
        if (video) {
          video.currentTime = clampedMs / 1000;
        }
      }
      setReplayElapsedMs(clampedMs);
    },
    [isReplayBoundToPreview, replayDurationMs]
  );

  return (
    <section className="card" style={{ marginTop: "1rem", display: "grid", gap: "0.85rem" }}>
      <div className="card" style={{ margin: 0, background: "rgba(114,168,255,0.1)" }}>
        <strong>Local processing notice</strong>
        <p className="muted" style={{ margin: "0.4rem 0 0" }}>
          Upload Video runs on this device using MediaPipe in your browser. Keep this tab open while processing. Switching tabs can slow processing, and closing/reloading stops queued jobs.
        </p>
      </div>

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="pill" onClick={() => fileInputRef.current?.click()}>Upload videos and analyze</button>
        <label className="muted" style={{ fontSize: "0.85rem" }}>
          Select drill
          <select
            value={selectedDrillKey ?? ""}
            onChange={(event) => setSelectedDrillKey(event.target.value)}
            style={{ marginLeft: "0.35rem", minWidth: 240 }}
            disabled={drillOptionsLoading || drillOptions.length === 0}
          >
            {drillOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label} ({option.sourceKind})
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="pill" disabled={!hasReadyDrills} onClick={() => fileInputRef.current?.click()}>Upload videos and analyze</button>
        <label className="muted" style={{ fontSize: "0.85rem" }}>
          Ready drill
          <select
            value={selectedReadyDrill?.drillId ?? ""}
            onChange={(event) => setSelectedReadyDrillId(event.target.value)}
            style={{ marginLeft: "0.35rem" }}
          >
            {(readyDrills ?? []).map((drill) => (
              <option key={drill.drillId} value={drill.drillId}>
                {drill.title} {drill.isPublished ? "(Published)" : "(Ready)"}
              </option>
            ))}
            {(readyDrills ?? []).length === 0 ? <option value="">No ready drills (using sample fallback)</option> : null}
          </select>
        </label>
        <span className="muted">Linked drill: {referenceDrill.title}</span>
        <label className="muted" style={{ fontSize: "0.85rem" }}>
          Cadence FPS
          <input type="number" min={4} max={30} value={cadenceFps} onChange={(event) => setCadenceFps(Math.max(4, Math.min(30, Number(event.target.value) || DEFAULT_CADENCE_FPS)))} style={{ marginLeft: "0.35rem", width: 70 }} />
        </label>
        <input ref={fileInputRef} type="file" accept="video/*" multiple style={{ display: "none" }} onChange={(event) => event.target.files && enqueueFiles(event.target.files)} />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Selected drill: <strong>{(selectedDrill?.drill ?? fallbackDrill).title}</strong> • type {(selectedDrill?.drill ?? fallbackDrill).drillType} • source{" "}
        {selectedDrill?.sourceKind ?? "seeded"} {selectedDrill?.sourceId ? `(${selectedDrill.sourceId})` : ""}
      </p>
      {!hasReadyDrills ? (
        <p className="muted" style={{ margin: 0, color: "#f0b47d" }}>
          No Ready drills yet. Mark a drill version Ready in My drills before upload analysis.
        </p>
      ) : null}

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
            {(() => {
              const linkedSession = findLatestSessionForUpload(recentSessions, job.id);
              const lifecycleState = getUploadLifecycleState(job, Boolean(linkedSession));
              const lifecycleLabel = getLifecycleLabel(lifecycleState);
              const lifecycleTone = toneStyles(
                lifecycleState === "analysis_failed"
                  ? "bad"
                  : lifecycleState === "results_available"
                    ? "good"
                    : lifecycleState === "no_structured_result_yet"
                      ? "warn"
                      : "neutral"
              );
              return (
                <div style={{ marginBottom: "0.55rem" }}>
                  <span className="pill" style={{ borderColor: lifecycleTone.border, background: lifecycleTone.background }}>{lifecycleLabel}</span>
                </div>
              );
            })()}
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
              <div>
                <strong>{job.fileName}</strong>
                <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                  {formatBytes(job.fileSizeBytes)} • {formatDuration(job.durationMs)} • {job.status}
                </p>
                <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                  Queued drill: {job.drillSelection.drillBinding.drillName} ({job.drillSelection.drillBinding.sourceKind})
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
                {findLatestSessionForUpload(recentSessions, job.id) ? (
                  <button
                    type="button"
                    className="pill"
                    onClick={() => setSelectedSessionId(findLatestSessionForUpload(recentSessions, job.id)!.sessionId)}
                  >
                    View analysis
                  </button>
                ) : null}
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

      {selectedJob ? (
        <section className="card" style={{ margin: 0, background: "rgba(114,168,255,0.08)" }}>
          <h3 style={{ marginTop: 0 }}>Current upload handoff</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Upload: <strong>{selectedJob.fileName}</strong> • Status: {getLifecycleLabel(getUploadLifecycleState(selectedJob, Boolean(selectedJobLinkedSession)))}
          </p>
          {selectedJobLinkedSession ? (
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
              <button type="button" className="pill" onClick={() => setSelectedSessionId(selectedJobLinkedSession.sessionId)}>
                Open latest analysis session
              </button>
              <span className="muted">Session: {selectedJobLinkedSession.sessionId}</span>
            </div>
          ) : (
            <p className="muted" style={{ marginBottom: 0 }}>
              Structured results are not available for this upload yet.
            </p>
          )}
        </section>
      ) : null}

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
            <span><strong>Annotated Video:</strong> exported replay includes pose + persisted drill-analysis overlays when available.</span>
            <span><strong>Processing Summary (.json):</strong> lightweight summary metadata about this run.</span>
            <span><strong>Pose Timeline (.json):</strong> frame-by-frame pose keypoints and timestamps.</span>
          </div>
        </section>
      ) : null}

      <section className="card" style={{ margin: 0 }}>
        <h3 style={{ marginTop: 0 }}>Recent analyses</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Jump back into the latest session, drill-linked history, or a result tied to the current upload.
        </p>
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginBottom: "0.55rem" }}>
          {selectedJobLinkedSession ? (
            <button type="button" className="pill" onClick={() => setSelectedSessionId(selectedJobLinkedSession.sessionId)}>
              Latest result from current upload
            </button>
          ) : null}
          {drillSessions[0] ? (
            <button type="button" className="pill" onClick={() => setSelectedSessionId(drillSessions[0].sessionId)}>
              Latest analysis for this drill
            </button>
          ) : null}
        </div>
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
              <strong>{session.drillTitle ?? session.drillId}</strong> • {new Date(session.createdAtIso).toLocaleString()} • {getSessionOutcomeLabel(session)} • reps{" "}
              {session.summary.repCount ?? 0} • duration {formatDuration(session.summary.analyzedDurationMs)}
            </button>
          ))}
        </div>
        {selectedSession ? (
          <article className="card" style={{ marginBottom: 0, marginTop: "0.75rem" }}>
            <h4 style={{ marginTop: 0 }}>Session detail</h4>
            <div
              style={{
                border: `1px solid ${toneStyles(getSessionStatusTone(selectedSession.status)).border}`,
                background: toneStyles(getSessionStatusTone(selectedSession.status)).background,
                borderRadius: "0.6rem",
                padding: "0.6rem",
                marginBottom: "0.55rem"
              }}
            >
              <p style={{ margin: 0 }}>
                <strong>{getSessionOutcomeLabel(selectedSession)}</strong> • {new Date(selectedSession.createdAtIso).toLocaleString()}
              </p>
              <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                Source upload: {selectedSession.sourceLabel ?? selectedSession.sourceId ?? "n/a"} • Session ID: {selectedSession.sessionId}
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginBottom: "0.45rem" }}>
              <span className="pill">Reps: {selectedSession.summary.repCount ?? 0}</span>
              <span className="pill">Hold duration: {formatDuration(selectedSession.summary.holdDurationMs)}</span>
              <span className="pill">Analyzed duration: {formatDuration(selectedSession.summary.analyzedDurationMs)}</span>
              <span className="pill">Frame samples: {selectedSession.frameSamples.length}</span>
              <span className="pill">Events: {selectedSession.events.length}</span>
            </div>
            {summarizeSessionAvailability(selectedSession).length > 0 ? (
              <p className="muted" style={{ marginTop: 0 }}>
                Availability notes: {summarizeSessionAvailability(selectedSession).join(" • ")}
              </p>
            ) : null}
            <div className="card" style={{ margin: "0.55rem 0 0", background: "rgba(148,163,184,0.08)" }}>
              <h5 style={{ margin: 0 }}>Drill linkage</h5>
              <p className="muted" style={{ margin: "0.35rem 0 0" }}>
                Drill: {selectedSession.drillBinding?.drillName ?? selectedSession.drillTitle ?? selectedSession.drillId} • id{" "}
                {selectedSession.drillBinding?.drillId ?? selectedSession.drillId} • version{" "}
                {selectedSession.drillBinding?.drillVersion ?? selectedSession.drillVersion ?? "n/a"} • source{" "}
                {selectedSession.drillBinding?.sourceKind ?? "unknown"}
              </p>
            </div>
            <details open style={{ marginTop: "0.6rem" }}>
              <summary style={{ cursor: "pointer" }}>Analysis inspection</summary>
              {selectedSession.debug?.noEventCause ? (
                <p className="muted" style={{ marginTop: "0.45rem" }}>
                  No-event cause: {selectedSession.debug.noEventCause}
                  {selectedSession.debug.noEventDetails?.length
                    ? ` • ${selectedSession.debug.noEventDetails.join(" • ")}`
                    : ""}
                </p>
              ) : null}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.45rem" }}>
                  <thead>
                    <tr className="muted">
                      <th style={{ textAlign: "left" }}>t(ms)</th>
                      <th style={{ textAlign: "left" }}>best phase</th>
                      <th style={{ textAlign: "left" }}>score</th>
                      <th style={{ textAlign: "left" }}>alternate</th>
                      <th style={{ textAlign: "left" }}>quality</th>
                      <th style={{ textAlign: "left" }}>smoothed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSession.frameSamples.slice(0, 250).map((sample) => {
                      const sortedCandidates = Object.entries(sample.perPhaseScores ?? {})
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 2)
                        .map(([phaseId, score]) => `${phaseId}:${score.toFixed(2)}`);
                      const smoothedFrame = selectedSession.debug?.smoothedFrames?.find((frame) => frame.timestampMs === sample.timestampMs);
                      return (
                        <tr key={`sample-${sample.timestampMs}`}>
                          <td><button type="button" className="pill" onClick={() => handleReplaySeek(sample.timestampMs)}>{sample.timestampMs}</button></td>
                          <td>{sample.classifiedPhaseId ?? "unknown"}</td>
                          <td>{sample.confidence.toFixed(2)}</td>
                          <td>{sortedCandidates.join(", ") || "n/a"}</td>
                          <td>{sample.confidence < 0.35 ? "low-confidence" : "ok"}</td>
                          <td>{smoothedFrame?.smoothedPhaseId ?? "unknown"} {smoothedFrame?.transitionAccepted ? "✓" : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {selectedSession.frameSamples.length > 250 ? (
                <p className="muted" style={{ marginBottom: 0 }}>Showing first 250 samples to keep inspection responsive.</p>
              ) : null}
            </details>

            <details open style={{ marginTop: "0.6rem" }}>
              <summary style={{ cursor: "pointer" }}>Temporal trace</summary>
              <ol className="muted" style={{ marginBottom: "0.45rem" }}>
                {(selectedSession.debug?.smootherTransitions ?? []).map((transition, index) => (
                  <li key={`transition-${transition.timestampMs}-${index}`}>
                    <button type="button" className="pill" onClick={() => handleReplaySeek(transition.timestampMs)}>
                      {transition.type} @ {(transition.timestampMs / 1000).toFixed(2)}s • from {transition.fromPhaseId ?? "n/a"} • to{" "}
                      {transition.toPhaseId ?? transition.phaseId ?? "n/a"}
                      {transition.details?.["reason"] ? ` • reason=${String(transition.details["reason"])}` : ""}
                    </button>
                  </li>
                ))}
              </ol>
            </details>
            <div className="card" style={{ margin: "0.7rem 0 0", background: "rgba(114,168,255,0.08)" }}>
              <h5 style={{ margin: 0 }}>Replay review</h5>
              <p className="muted" style={{ margin: "0.35rem 0 0.5rem" }}>
                {selectedSession.drillTitle ?? selectedSession.drillId} • {new Date(selectedSession.createdAtIso).toLocaleString()} • quality {replayOverview.qualityLabel}
              </p>
              <p className="muted" style={{ margin: "0 0 0.45rem" }}>
                {isReplayBoundToPreview
                  ? "Replay controls are synced to the visible preview video."
                  : "Replay controls are using persisted session timing only (no matching preview video selected)."}
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
                <button type="button" className="pill" onClick={handleReplayPlayPause} disabled={replayDurationMs <= 0}>
                  {isReplayPlaying ? "Pause" : "Play"}
                </button>
                <button type="button" className="pill" onClick={handleReplayReset} disabled={replayDurationMs <= 0}>Reset</button>
              </div>
              <div style={{ position: "relative", paddingTop: "0.65rem" }}>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, replayDurationMs)}
                  value={Math.min(replayElapsedMs, replayDurationMs)}
                  onChange={(event) => handleReplaySeek(Number(event.target.value))}
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

            <details open>
              <summary style={{ cursor: "pointer" }}>Events</summary>
              <ol className="muted">
                {selectedSession.events.map((event) => (
                  <li key={event.eventId} style={{ marginBottom: "0.25rem" }}>
                    <button type="button" className="pill" onClick={() => handleReplaySeek(event.timestampMs)}>
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
              <summary style={{ cursor: "pointer" }}>Debug and pipeline details</summary>
              <ul className="muted" style={{ marginBottom: "0.45rem" }}>
                <li>Session ID: {selectedSession.sessionId}</li>
                <li>Drill ID: {selectedSession.drillId}</li>
                <li>Pipeline version: {selectedSession.pipelineVersion ?? "unknown"}</li>
                <li>Scorer version: {selectedSession.scorerVersion ?? "unknown"}</li>
                <li>Cadence FPS: {selectedSession.debug?.cadenceFps ?? "n/a"}</li>
                <li>Detector: {selectedSession.debug?.detector ?? "n/a"}</li>
                <li>Source URI: {selectedSession.rawVideoUri ?? selectedSession.sourceUri ?? "n/a"}</li>
                <li>Annotated URI: {selectedSession.annotatedVideoUri ?? "n/a"}</li>
                {selectedSession.debug?.errorMessage ? <li>Error context: {selectedSession.debug.errorMessage}</li> : null}
              </ul>
            </details>

            <details>
              <summary style={{ cursor: "pointer" }}>Raw JSON (optional)</summary>
              <pre className="muted" style={{ whiteSpace: "pre-wrap" }}>{serializeAnalysisSessionArtifact(selectedSession)}</pre>
            </details>
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
              <button
                type="button"
                className="pill"
                onClick={() =>
                  downloadBlob(
                    new Blob([serializeAnalysisSessionArtifact(selectedSession)], { type: "application/json" }),
                    createAnalysisArtifactFilename(selectedSession)
                  )
                }
              >
                Download Analysis Artifact (.json)
              </button>
              <button
                type="button"
                className="pill"
                onClick={async () => {
                  const importedSession = createImportedAnalysisSessionCopy(selectedSession, {
                    importedSessionId: crypto.randomUUID()
                  });
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
