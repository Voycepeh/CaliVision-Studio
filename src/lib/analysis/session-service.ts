import { runDrillAnalysisPipeline } from "./analysis-runner.ts";
import { buildPhaseRuntimeModel, resolveAuthoredPhaseLabel } from "./phase-runtime.ts";
import { formatCameraViewLabel, resolveDrillCameraViewWithDiagnostics, type DrillCameraView } from "./camera-view.ts";
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
  drill: PortableDrill;
  drillVersion?: string;
  drillBinding?: AnalysisSessionRecord["drillBinding"];
  timeline: PoseTimeline;
  sourceId?: string;
  sourceUri?: string;
  sourceLabel?: string;
  annotatedVideoUri?: string;
  resolvedCameraView?: DrillCameraView;
};

function createRuntimeDiagnostics(drill: PortableDrill, output: ReturnType<typeof runDrillAnalysisPipeline>) {
  const analysis = drill.analysis;
  if (!analysis) {
    return undefined;
  }
  const runtimeModel = buildPhaseRuntimeModel(drill, analysis);
  const rejectedTransition = output.transitions
    .filter((transition) => transition.type === "invalid_transition")
    .at(-1);
  const lastTransition = output.transitions
    .filter((transition) => transition.type === "phase_enter")
    .at(-1);
  const prevTransition = [...output.transitions]
    .reverse()
    .find((transition) => transition.type === "phase_enter" && transition.phaseId && transition.phaseId !== lastTransition?.phaseId);
  const repEvent = [...output.session.events].reverse().find((event) => event.type === "rep_complete");

  return {
    phaseCount: runtimeModel.phaseCount,
    expectedPhaseOrder: runtimeModel.loopPhaseIds.map((phaseId) => resolveAuthoredPhaseLabel(phaseId, runtimeModel.phaseLabelById) ?? phaseId),
    expectedLoop: runtimeModel.loopLabel,
    allowedTransitions: [...runtimeModel.allowedTransitionKeys].map((key) => {
      const [fromPhaseId, toPhaseId] = key.split("->");
      return `${resolveAuthoredPhaseLabel(fromPhaseId, runtimeModel.phaseLabelById) ?? fromPhaseId} -> ${resolveAuthoredPhaseLabel(toPhaseId, runtimeModel.phaseLabelById) ?? toPhaseId}`;
    }),
    currentPhase: resolveAuthoredPhaseLabel(lastTransition?.phaseId, runtimeModel.phaseLabelById),
    previousPhase: resolveAuthoredPhaseLabel(prevTransition?.phaseId, runtimeModel.phaseLabelById),
    attemptedNextPhase: resolveAuthoredPhaseLabel(rejectedTransition?.toPhaseId, runtimeModel.phaseLabelById),
    expectedNextPhase: (() => {
      if (runtimeModel.orderedPhaseIds.length === 0) {
        return undefined;
      }
      const currentIndex = runtimeModel.phaseById[lastTransition?.phaseId ?? ""]?.sequenceIndex ?? -1;
      const nextIndex = currentIndex >= 0
        ? (currentIndex + 1) % runtimeModel.orderedPhaseIds.length
        : 0;
      return runtimeModel.phaseById[runtimeModel.orderedPhaseIds[nextIndex] ?? ""]?.displayLabel;
    })(),
    rejectedReason: rejectedTransition?.details?.reason ? String(rejectedTransition.details.reason) : undefined,
    noRepReason: output.session.summary.repCount ? undefined : runtimeModel.measurementMode === "rep"
      ? runtimeModel.phaseCount < runtimeModel.repRequiresAtLeastPhaseCount
        ? "insufficient_phase_count_for_rep"
        : "loop_not_completed"
      : undefined,
    legacyOrderMismatch: runtimeModel.legacyOrderMismatch,
    legacyOrderMismatchDetails: runtimeModel.legacyOrderMismatchDetails,
    modeSummary: runtimeModel.measurementMode === "rep" ? runtimeModel.repCompletionSummary : runtimeModel.holdSummary,
    lastRepCompleted: repEvent?.repIndex ?? null
  };
}

function deriveNoEventCause(output: ReturnType<typeof runDrillAnalysisPipeline>): { cause?: string; details: string[] } {
  const details: string[] = [];
  if (output.session.events.length > 0) {
    return { details };
  }
  if (output.scoredFrames.length === 0) {
    return { cause: "no_frame_samples", details: ["No sampled frames were available."] };
  }

  const confidenceThreshold = 0.35;
  const highConfidenceFrames = output.scoredFrames.filter((frame) => frame.bestPhaseScore >= confidenceThreshold).length;
  const phaseEnterTransitions = output.transitions.filter((transition) => transition.type === "phase_enter").length;
  const invalidTransitions = output.transitions.filter((transition) => transition.type === "invalid_transition").length;
  const smoothedFrames = output.smoothedFrames.filter((frame) => frame.smoothedPhaseId).length;

  if (highConfidenceFrames === 0) {
    return {
      cause: "low_confidence_frames",
      details: ["All sampled frames were below the classification confidence threshold."]
    };
  }
  if (smoothedFrames === 0) {
    return {
      cause: "no_valid_smoothed_phases",
      details: ["Temporal smoothing did not produce a stable phase timeline."]
    };
  }
  if (phaseEnterTransitions === 0) {
    return {
      cause: "no_confirmed_phase_transitions",
      details: ["No phase transitions were confirmed by the temporal smoother."]
    };
  }
  if (invalidTransitions > 0) {
    details.push("Some transitions were rejected by ordered sequence or allowed-skip rules.");
  }

  return {
    cause: "sequence_or_hold_not_satisfied",
    details: details.length > 0
      ? details
      : ["Ordered rep sequence or hold qualification conditions were never satisfied."]
  };
}

export function buildCompletedUploadAnalysisSession(input: PersistUploadInput): AnalysisSessionRecord {
  const cameraViewResolution = input.resolvedCameraView
    ? { cameraView: input.resolvedCameraView, diagnostics: { usedFallback: false } }
    : resolveDrillCameraViewWithDiagnostics(input.drill);

  const output = runDrillAnalysisPipeline({
    drill: input.drill,
    cameraView: cameraViewResolution.cameraView,
    sampledFrames: input.timeline.frames,
    sourceType: "upload-video",
    sourceLabel: input.sourceLabel ?? input.timeline.video.fileName
  });

  return {
    sessionId: output.session.sessionId,
    drillId: output.session.drillId,
    drillTitle: input.drill.title,
    drillVersion: input.drillVersion,
    drillMeasurementType: input.drill.analysis?.measurementType ?? input.drill.drillType,
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
      cameraView: cameraViewResolution.cameraView,
      cameraViewLabel: formatCameraViewLabel(cameraViewResolution.cameraView),
      cameraViewWarning: cameraViewResolution.diagnostics.warning,
      sourceVideoFileName: input.timeline.video.fileName,
      smootherTransitions: output.transitions,
      smoothedFrames: output.smoothedFrames,
      phaseScoringFrames: output.session.frameSamples,
      runtimeDiagnostics: createRuntimeDiagnostics(input.drill, output),
      ...deriveNoEventCause(output)
    },
    drillBinding: input.drillBinding ?? {
      drillId: input.drill.drillId,
      drillName: input.drill.title,
      drillVersion: input.drillVersion,
      sourceKind: "unknown"
    }
  };
}

export async function persistCompletedUploadAnalysisSession(
  input: PersistUploadInput & { repository: AnalysisSessionRepository }
): Promise<AnalysisSessionRecord> {
  const session = buildCompletedUploadAnalysisSession(input);
  await input.repository.saveSession(session);
  return session;
}

export async function persistFailedUploadAnalysisSession(input: {
  repository: AnalysisSessionRepository;
  drill: PortableDrill;
  drillVersion?: string;
  drillBinding?: AnalysisSessionRecord["drillBinding"];
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
    drillMeasurementType: input.drill.analysis?.measurementType ?? input.drill.drillType,
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
    },
    drillBinding: input.drillBinding ?? {
      drillId: input.drill.drillId,
      drillName: input.drill.title,
      drillVersion: input.drillVersion,
      sourceKind: "unknown"
    }
  };

  await input.repository.saveSession(session);
  return session;
}
