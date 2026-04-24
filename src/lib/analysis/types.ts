import type {
  AnalysisEvent,
  AnalysisSession,
  CanonicalJointName,
  PortableDrill,
  PortablePhase,
  PortablePose
} from "../schema/contracts.ts";
import type { PoseFrame } from "../upload/types.ts";
import type { DrillCameraView } from "./camera-view.ts";
import type { PoseNormalizationDebug } from "./pose-normalization.ts";

export type AnalysisFrameQuality = {
  missingRequiredJoints: CanonicalJointName[];
  missingOptionalJoints: CanonicalJointName[];
  usableJointCount: number;
};

export type FramePhaseScore = {
  timestampMs: number;
  bestPhaseId: string | null;
  bestPhaseScore: number;
  perPhaseScores: Record<string, number>;
  debug?: FramePhaseScoreDebug;
  quality: AnalysisFrameQuality;
};

export type FramePhaseScoreDebug = {
  cameraView: DrillCameraView;
  jointSubsetByPhaseId: Record<string, CanonicalJointName[]>;
  mirrorApplied: boolean;
  runtimeNormalization: PoseNormalizationDebug;
  sideOrientationModeByPhaseId?: Record<string, "native" | "mirrored">;
  phaseComparisons: Record<string, {
    templateNormalization: PoseNormalizationDebug;
    perJointDelta: Partial<Record<CanonicalJointName, number>>;
    rawScore: number;
    adjustedScore: number;
    orientationMode?: "native" | "mirrored";
    nativeAdjustedScore?: number;
    mirroredAdjustedScore?: number;
  }>;
  holdGate?: {
    targetPhaseId: string;
    passed: boolean;
    threshold: number;
    score: number;
    reason?: "low_match_score" | "wrist_below_shoulder" | "elbow_below_shoulder" | "insufficient_confidence";
  };
};

export type SmoothedPhaseFrame = {
  timestampMs: number;
  rawBestPhaseId: string | null;
  rawBestPhaseScore: number;
  smoothedPhaseId: string | null;
  transitionAccepted: boolean;
};

export type SmootherTransition = {
  timestampMs: number;
  type: "phase_enter" | "phase_exit" | "invalid_transition";
  fromPhaseId?: string;
  toPhaseId?: string;
  phaseId?: string;
  details?: Record<string, string | number | boolean>;
};

export type TemporalSmoothingResult = {
  frames: SmoothedPhaseFrame[];
  transitions: SmootherTransition[];
};

export type AnalysisRunInput = {
  drill: PortableDrill;
  sampledFrames: PoseFrame[];
  cameraView?: DrillCameraView;
  sourceLabel?: string;
  sourceType?: AnalysisSession["source"]["sourceType"];
  maxTimestampMs?: number;
};

export type AnalysisRunOutput = {
  session: AnalysisSession;
  scoredFrames: FramePhaseScore[];
  smoothedFrames: SmoothedPhaseFrame[];
  transitions: SmootherTransition[];
};

export type ScorerOptions = {
  minimumScoreThreshold?: number;
  includePerPhaseScores?: boolean;
  defaultTolerance?: number;
  cameraView?: DrillCameraView;
  holdTargetPhaseId?: string;
  holdMinimumScoreThreshold?: number;
};

export type PoseLike = PoseFrame | PortablePose;

export type DrillContext = {
  drill: PortableDrill;
  phaseById: Map<string, PortablePhase>;
};

export type EventExtractionResult = {
  events: AnalysisEvent[];
  summary: AnalysisSession["summary"];
};
