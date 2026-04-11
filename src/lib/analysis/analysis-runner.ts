import { extractAnalysisEvents } from "./event-extractor.ts";
import { buildPhaseRuntimeModel } from "./phase-runtime.ts";
import { scoreFramesAgainstDrillPhases } from "./frame-phase-scorer.ts";
import { smoothPhaseTimeline } from "./temporal-phase-smoother.ts";
import type { AnalysisRunInput, AnalysisRunOutput } from "./types.ts";

export function runDrillAnalysisPipeline(input: AnalysisRunInput): AnalysisRunOutput {
  const resolvedCameraView = input.cameraView ?? "front";
  const scoredFrames = scoreFramesAgainstDrillPhases(input.sampledFrames, input.drill.phases, {
    includePerPhaseScores: true,
    cameraView: resolvedCameraView
  });

  const effectiveAnalysis = input.drill.analysis ?? createFallbackAnalysis();
  const runtimeModel = buildPhaseRuntimeModel(input.drill, effectiveAnalysis);
  const smoothed = smoothPhaseTimeline(scoredFrames, effectiveAnalysis, {
    runtimeModel,
    entryConfirmationFrames: effectiveAnalysis.measurementType === "hold"
      ? effectiveAnalysis.entryConfirmationFrames
      : effectiveAnalysis.minimumConfirmationFrames
  });
  const extracted = extractAnalysisEvents(input.drill, smoothed.frames, smoothed.transitions, runtimeModel);

  const startedAtIso = new Date().toISOString();
  const completedAtIso = new Date().toISOString();
  const analyzedDurationMs = input.sampledFrames.length > 1
    ? input.sampledFrames[input.sampledFrames.length - 1].timestampMs - input.sampledFrames[0].timestampMs
    : 0;

  const confidenceAvg = scoredFrames.length === 0
    ? 0
    : scoredFrames.reduce((sum, frame) => sum + frame.bestPhaseScore, 0) / scoredFrames.length;

  const lowConfidenceFrames = scoredFrames.filter((frame) => frame.bestPhaseScore < 0.35).length;

  const phaseCoverage: Record<string, number> = {};
  for (const frame of smoothed.frames) {
    if (!frame.smoothedPhaseId) {
      continue;
    }
    phaseCoverage[frame.smoothedPhaseId] = (phaseCoverage[frame.smoothedPhaseId] ?? 0) + 1;
  }

  return {
    scoredFrames,
    smoothedFrames: smoothed.frames,
    transitions: smoothed.transitions,
    session: {
      sessionId: `analysis_${Date.now()}`,
      drillId: input.drill.drillId,
      source: {
        sourceType: input.sourceType ?? "manual",
        sourceLabel: input.sourceLabel,
        capturedFps: estimateCapturedFps(input.sampledFrames)
      },
      startedAtIso,
      completedAtIso,
      frameSamples: smoothed.frames.map((frame) => ({
        timestampMs: frame.timestampMs,
        classifiedPhaseId: frame.smoothedPhaseId ?? undefined,
        confidence: frame.rawBestPhaseScore,
        perPhaseScores: scoredFrames.find((score) => score.timestampMs === frame.timestampMs)?.perPhaseScores,
        scoringDebug: scoredFrames.find((score) => score.timestampMs === frame.timestampMs)?.debug
      })),
      events: extracted.events,
      summary: {
        ...extracted.summary,
        holdDurationMs: extracted.summary.holdDurationMs,
        repCount: extracted.summary.repCount,
        partialAttemptCount: extracted.summary.partialAttemptCount,
        invalidTransitionCount: extracted.summary.invalidTransitionCount,
        confidenceAvg,
        lowConfidenceFrames,
        analyzedDurationMs,
        detectedPhaseCoverage: Object.keys(phaseCoverage).length
      }
    }
  };
}

function estimateCapturedFps(frames: AnalysisRunInput["sampledFrames"]): number | undefined {
  if (frames.length < 2) {
    return undefined;
  }

  const first = frames[0].timestampMs;
  const last = frames[frames.length - 1].timestampMs;
  const durationMs = last - first;
  if (durationMs <= 0) {
    return undefined;
  }

  const avgFrameMs = durationMs / (frames.length - 1);
  return Number((1000 / avgFrameMs).toFixed(2));
}

function createFallbackAnalysis() {
  return {
    measurementType: "rep" as const,
    orderedPhaseSequence: [],
    criticalPhaseIds: [],
    allowedPhaseSkips: [],
    minimumConfirmationFrames: 2,
    exitGraceFrames: 2,
    minimumRepDurationMs: 300,
    cooldownMs: 150,
    entryConfirmationFrames: 2,
    minimumHoldDurationMs: 500
  };
}
