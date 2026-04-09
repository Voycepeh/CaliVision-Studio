import type { AnalysisEvent, AnalysisSummaryMetrics, FramePhaseSample, PortableDrill } from "../schema/contracts.ts";
import type { AnalysisSessionRecord } from "../analysis/session-repository.ts";
import type { ReplayOverlayState } from "../analysis/replay-state.ts";
import type { PoseFrame, PoseTimeline } from "../upload/types.ts";

export type LiveSessionStatus =
  | "idle"
  | "requesting-permission"
  | "live-session-running"
  | "stopping-finalizing"
  | "completed"
  | "failed"
  | "denied"
  | "unsupported";

export type LiveDrillSelection = {
  mode: "freestyle" | "drill";
  drill?: PortableDrill;
  drillVersion?: string;
  drillBindingLabel: string;
  drillBindingSource: "freestyle" | "local" | "hosted";
  sourceId?: string;
};

export type LiveTraceCapture = {
  timestampMs: number;
  sourceMediaTimeMs?: number;
  frame: PoseFrame;
  frameSample: FramePhaseSample;
};

export type LiveAnalyzedFrameState = {
  timestampMs: number;
  poseFrame: PoseFrame | null;
  frameConfidence: number | null;
  overlay: ReplayOverlayState;
};

export type LiveSessionTrace = {
  schemaVersion: "live-session-trace-v1";
  traceId: string;
  startedAtIso: string;
  completedAtIso: string;
  sourceType: "browser-camera";
  drillSelection: LiveDrillSelection;
  cadenceFps: number;
  video: {
    durationMs: number;
    width: number;
    height: number;
    mimeType: string;
    sizeBytes: number;
    timing: {
      mediaStartMs: number;
      mediaStopMs: number;
      captureStartPerfNowMs: number;
      captureStopPerfNowMs: number;
    };
  };
  captures: LiveTraceCapture[];
  events: AnalysisEvent[];
  summary: AnalysisSummaryMetrics;
};

export type FinalizedLiveSession = {
  trace: LiveSessionTrace;
  timeline: PoseTimeline;
  analysisSession: AnalysisSessionRecord;
  rawVideo: {
    blob: Blob;
    mimeType: string;
    objectUrl: string;
    fileName: string;
  };
};
