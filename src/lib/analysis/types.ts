import type {
  AnalysisEvent,
  AnalysisSession,
  CanonicalJointName,
  PortableDrill,
  PortablePhase,
  PortablePose
} from "../schema/contracts.ts";
import type { PoseFrame } from "../upload/types.ts";

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
  quality: AnalysisFrameQuality;
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
  sourceLabel?: string;
  sourceType?: AnalysisSession["source"]["sourceType"];
};

export type AnalysisRunOutput = {
  session: AnalysisSession;
  scoredFrames: FramePhaseScore[];
  smoothedFrames: SmoothedPhaseFrame[];
};

export type ScorerOptions = {
  minimumScoreThreshold?: number;
  includePerPhaseScores?: boolean;
  defaultTolerance?: number;
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
