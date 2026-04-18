export * from "./types.ts";
export { scoreFramesAgainstDrillPhases } from "./frame-phase-scorer.ts";
export { formatCameraViewLabel, normalizeCameraView, resolveDrillCameraView, resolveDrillCameraViewWithDiagnostics } from "./camera-view.ts";
export { smoothPhaseTimeline } from "./temporal-phase-smoother.ts";
export { extractAnalysisEvents } from "./event-extractor.ts";
export { runDrillAnalysisPipeline } from "./analysis-runner.ts";
export {
  createImportedAnalysisSessionCopy,
  deserializeAnalysisSession,
  getBrowserAnalysisSessionRepository,
  IndexedDbAnalysisSessionRepository,
  InMemoryAnalysisSessionRepository,
  serializeAnalysisSession
} from "./session-repository.ts";
export type { AnalysisSessionRecord, AnalysisSessionRepository } from "./session-repository.ts";
export {
  buildCompletedUploadAnalysisSession,
  persistCompletedUploadAnalysisSession,
  persistFailedUploadAnalysisSession
} from "./session-service.ts";
export {
  compareAttemptPhasesToBenchmark,
  compareAttemptTimingToBenchmark,
  compareAttemptToBenchmark,
  compareHoldAttemptToBenchmark,
  compareRepAttemptToBenchmark
} from "./benchmark-comparison.ts";
export type { BenchmarkComparisonResult, BenchmarkComparisonStatus } from "./benchmark-comparison.ts";

export {
  buildBenchmarkCoachingFeedback,
  getComparisonSeverity,
  getTopComparisonFindings,
  summarizeBenchmarkComparison
} from "./benchmark-feedback.ts";
export type { BenchmarkCoachingFeedback, BenchmarkComparisonSummary, BenchmarkFeedbackCategory, BenchmarkFeedbackItem, BenchmarkFeedbackSeverity } from "./benchmark-feedback.ts";

export {
  ANALYSIS_ARTIFACT_TYPE,
  ANALYSIS_ARTIFACT_VERSION,
  createAnalysisArtifactFilename,
  createAnalysisSessionArtifact,
  deserializeAnalysisSessionArtifact,
  serializeAnalysisSessionArtifact
} from "./export-artifact.ts";
export type { AnalysisSessionArtifact } from "./export-artifact.ts";

export {
  deriveReplayMarkers,
  deriveReplayOverlayStateAtTime,
  deriveReplaySessionOverview,
  deriveReplayStateAtTime,
  getReplayDurationMs
} from "./replay-state.ts";

export {
  buildPhaseRuntimeModel,
  buildPhaseSimilarityWarnings,
  filterPhaseIdsToRuntime,
  resolveAuthoredPhaseLabel
} from "./phase-runtime.ts";
