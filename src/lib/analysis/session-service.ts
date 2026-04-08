import { runDrillAnalysisPipeline } from "./analysis-runner.ts";
import type { AnalysisSessionRecord, AnalysisSessionRepository } from "./session-repository.ts";
import type { PortableDrill } from "../schema/contracts.ts";
import type { PoseTimeline } from "../upload/types.ts";

const PIPELINE_VERSION = "drill-analysis-pipeline-v1";
const SCORER_VERSION = "frame-phase-scorer-v1";

function inferUploadSessionStatus(output: ReturnType<typeof runDrillAnalysisPipeline>["session"]): AnalysisSessionRecord["status"] {
  if (output.frameSamples.length === 0) {
    return "partial";
  }
  if ((output.summary.analyzedDurationMs ?? 0) <= 0) {
    return "partial";
  }
  return "completed";
}

type PersistUploadInput = {
  repository: AnalysisSessionRepository;
  drill: PortableDrill;
  drillVersion?: string;
  timeline: PoseTimeline;
  sourceId?: string;
  sourceUri?: string;
  sourceLabel?: string;
  annotatedVideoUri?: string;
};

export async function persistCompletedUploadAnalysisSession(input: PersistUploadInput): Promise<AnalysisSessionRecord> {
  const output = runDrillAnalysisPipeline({
    drill: input.drill,
    sampledFrames: input.timeline.frames,
    sourceType: "upload-video",
    sourceLabel: input.sourceLabel ?? input.timeline.video.fileName
  });

  const session: AnalysisSessionRecord = {
    sessionId: output.session.sessionId,
    drillId: output.session.drillId,
    drillTitle: input.drill.title,
    drillVersion: input.drillVersion,
    pipelineVersion: PIPELINE_VERSION,
    scorerVersion: SCORER_VERSION,
    sourceKind: "upload",
    sourceId: input.sourceId,
    sourceUri: input.sourceUri,
    sourceLabel: input.sourceLabel ?? input.timeline.video.fileName,
    status: inferUploadSessionStatus(output.session),
    createdAtIso: output.session.startedAtIso,
    completedAtIso: output.session.completedAtIso,
    rawVideoUri: input.sourceUri,
    annotatedVideoUri: input.annotatedVideoUri,
    summary: output.session.summary,
    frameSamples: output.session.frameSamples,
    events: output.session.events,
    qualitySummary: {
      confidenceAvg: output.session.summary.confidenceAvg,
      lowConfidenceFrames: output.session.summary.lowConfidenceFrames
    },
    debug: {
      detector: input.timeline.detector,
      cadenceFps: input.timeline.cadenceFps,
      sourceVideoFileName: input.timeline.video.fileName
    }
  };

  await input.repository.saveSession(session);
  return session;
}

export async function persistFailedUploadAnalysisSession(input: {
  repository: AnalysisSessionRepository;
  drill: PortableDrill;
  drillVersion?: string;
  sourceId?: string;
  sourceUri?: string;
  sourceLabel?: string;
  errorMessage: string;
}): Promise<AnalysisSessionRecord> {
  const nowIso = new Date().toISOString();
  const session: AnalysisSessionRecord = {
    sessionId: `analysis_failed_${Date.now()}`,
    drillId: input.drill.drillId,
    drillTitle: input.drill.title,
    drillVersion: input.drillVersion,
    pipelineVersion: PIPELINE_VERSION,
    scorerVersion: SCORER_VERSION,
    sourceKind: "upload",
    sourceId: input.sourceId,
    sourceUri: input.sourceUri,
    sourceLabel: input.sourceLabel,
    status: "failed",
    createdAtIso: nowIso,
    completedAtIso: nowIso,
    rawVideoUri: input.sourceUri,
    summary: {
      repCount: 0,
      analyzedDurationMs: 0
    },
    frameSamples: [],
    events: [],
    debug: {
      errorMessage: input.errorMessage,
      sourceVideoFileName: input.sourceLabel
    }
  };

  await input.repository.saveSession(session);
  return session;
}
