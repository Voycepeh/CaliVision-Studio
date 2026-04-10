import type { AnalysisSessionRecord } from "../analysis/session-repository.ts";
import { formatCameraViewLabel } from "../analysis/camera-view.ts";
import type { PoseTimeline } from "../upload/types.ts";
import type { LiveSessionTrace } from "./types.ts";

export function buildTimelineFromLiveTrace(trace: LiveSessionTrace): PoseTimeline {
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
    generatedAtIso: trace.completedAtIso,
    frames: trace.captures.map((capture) => capture.frame)
  };
}

export function buildAnalysisSessionFromLiveTrace(trace: LiveSessionTrace): AnalysisSessionRecord {
  const drill = trace.drillSelection.drill;
  return {
    sessionId: trace.traceId,
    drillId: drill?.drillId ?? "freestyle",
    drillTitle: drill?.title ?? "No drill (Freestyle)",
    drillVersion: trace.drillSelection.drillVersion,
    drillMeasurementType: drill?.analysis?.measurementType ?? drill?.drillType,
    pipelineVersion: "live-session-trace-v1",
    scorerVersion: "frame-phase-scorer-v1",
    sourceKind: "live",
    sourceId: trace.traceId,
    sourceLabel: "Browser live session",
    status: "completed",
    createdAtIso: trace.startedAtIso,
    completedAtIso: trace.completedAtIso,
    summary: trace.summary,
    frameSamples: trace.captures.map((capture) => capture.frameSample),
    events: trace.events,
    qualitySummary: {
      confidenceAvg: trace.summary.confidenceAvg,
      lowConfidenceFrames: trace.summary.lowConfidenceFrames
    },
    debug: {
      detector: "mediapipe-pose-landmarker",
      cadenceFps: trace.cadenceFps,
      cameraView: trace.drillSelection.cameraView,
      cameraViewLabel: trace.drillSelection.cameraView ? formatCameraViewLabel(trace.drillSelection.cameraView) : undefined
    },
    drillBinding: {
      drillId: drill?.drillId ?? "freestyle",
      drillName: trace.drillSelection.drillBindingLabel,
      drillVersion: trace.drillSelection.drillVersion,
      sourceKind: trace.drillSelection.drillBindingSource === "freestyle" ? "unknown" : trace.drillSelection.drillBindingSource,
      sourceId: trace.drillSelection.sourceId
    }
  };
}
