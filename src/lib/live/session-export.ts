import type { AnalysisSessionRecord } from "../analysis/session-repository.ts";
import { exportAnnotatedVideo } from "../upload/processing.ts";
import { assessLiveTraceExportReadiness, formatLiveTraceExportDiagnostics } from "./export-readiness.ts";
import type { LiveSessionTrace } from "./types.ts";

export async function exportAnnotatedReplayFromLiveTrace(input: {
  rawVideo: File;
  trace: LiveSessionTrace;
  analysisSession: AnalysisSessionRecord;
  onProgress?: (progress: number, stageLabel: string) => void;
}): Promise<{ blob: Blob; mimeType: string; diagnostics: Awaited<ReturnType<typeof exportAnnotatedVideo>>["diagnostics"] }> {
  const readiness = assessLiveTraceExportReadiness(input.trace);
  if (!readiness.canAttemptAnnotatedExport) {
    throw new Error(
      `Annotated export rejected: finalized live trace is not renderable (${formatLiveTraceExportDiagnostics({ diagnostics: readiness.diagnostics, failureReasons: readiness.failureReasons })}).`
    );
  }

  const timeline = {
    schemaVersion: "upload-video-v1" as const,
    detector: "mediapipe-pose-landmarker" as const,
    cadenceFps: input.trace.cadenceFps,
    video: {
      fileName: input.rawVideo.name,
      width: input.trace.video.width,
      height: input.trace.video.height,
      durationMs: input.trace.video.durationMs,
      sizeBytes: input.rawVideo.size,
      mimeType: input.rawVideo.type || input.trace.video.mimeType
    },
    frames: input.trace.captures.map((capture) => capture.frame),
    generatedAtIso: input.trace.completedAtIso
  };
  const phaseLabels = (input.trace.drillSelection.drill?.phases ?? []).reduce<Record<string, string>>((acc, phase) => {
    const label = (phase.name || phase.title || "").trim();
    if (label) {
      acc[phase.phaseId] = label;
    }
    return acc;
  }, {});

  if (readiness.degradeToSparseExport) {
    console.warn("[live-overlay] annotated-export-degraded-trace", {
      diagnostics: readiness.diagnostics,
      warnings: readiness.warnings
    });
  }

  return exportAnnotatedVideo(input.rawVideo, timeline, {
    analysisSession: input.analysisSession,
    includeAnalysisOverlay: true,
    overlayModeLabel: input.trace.drillSelection.drillBindingLabel,
    includeDrillMetrics: input.trace.drillSelection.mode === "drill",
    phaseLabels,
    onProgress: input.onProgress
  });
}
