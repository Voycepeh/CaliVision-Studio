import type { CanonicalJointName } from "@/lib/schema/contracts";
import type { PoseFrame } from "@/lib/upload/types";

type JointPoint = { x: number; y: number; confidence?: number };

type SegmentDefinition = {
  from: CanonicalJointName;
  to: CanonicalJointName;
  weight: number;
  ratio: number;
  core?: boolean;
};

const SEGMENTS: SegmentDefinition[] = [
  { from: "leftShoulder", to: "leftHip", weight: 0.12, ratio: 0.5, core: true },
  { from: "rightShoulder", to: "rightHip", weight: 0.12, ratio: 0.5, core: true },
  { from: "leftHip", to: "rightHip", weight: 0.16, ratio: 0.5, core: true },
  { from: "leftShoulder", to: "rightShoulder", weight: 0.1, ratio: 0.5, core: true },
  { from: "leftHip", to: "leftKnee", weight: 0.1, ratio: 0.43 },
  { from: "rightHip", to: "rightKnee", weight: 0.1, ratio: 0.43 },
  { from: "leftKnee", to: "leftAnkle", weight: 0.08, ratio: 0.43 },
  { from: "rightKnee", to: "rightAnkle", weight: 0.08, ratio: 0.43 },
  { from: "leftShoulder", to: "leftElbow", weight: 0.05, ratio: 0.43 },
  { from: "rightShoulder", to: "rightElbow", weight: 0.05, ratio: 0.43 },
  { from: "leftElbow", to: "leftWrist", weight: 0.02, ratio: 0.43 },
  { from: "rightElbow", to: "rightWrist", weight: 0.02, ratio: 0.43 }
];

const TOTAL_SEGMENT_WEIGHT = SEGMENTS.reduce((sum, segment) => sum + segment.weight, 0);

export type CenterOfGravityEstimate = {
  x: number;
  y: number;
  coverageRatio: number;
  usedSegmentCount: number;
  hasCoreSegment: boolean;
};

export type CenterOfGravitySuppressionReason =
  | "insufficient_pose_data"
  | "insufficient_coverage"
  | "insufficient_core_segments"
  | "warming_up"
  | "seek_reset";

export type CenterOfGravityRenderDecision = {
  visible: boolean;
  point: { x: number; y: number } | null;
  coverageRatio: number;
  usedSegmentCount: number;
  reason: CenterOfGravitySuppressionReason | null;
};

export type CenterOfGravityTrackerOptions = {
  minJointConfidence?: number;
  minCoverageRatio?: number;
  minCoverageRatioForced?: number;
  requiredValidFrames?: number;
  smoothingAlpha?: number;
};

const DEFAULT_OPTIONS: Required<CenterOfGravityTrackerOptions> = {
  minJointConfidence: 0.32,
  minCoverageRatio: 0.28,
  minCoverageRatioForced: 0.14,
  requiredValidFrames: 1,
  smoothingAlpha: 0.45
};

function resolveOptions(options?: CenterOfGravityTrackerOptions): Required<CenterOfGravityTrackerOptions> {
  return {
    minJointConfidence: options?.minJointConfidence ?? DEFAULT_OPTIONS.minJointConfidence,
    minCoverageRatio: options?.minCoverageRatio ?? DEFAULT_OPTIONS.minCoverageRatio,
    minCoverageRatioForced: options?.minCoverageRatioForced ?? DEFAULT_OPTIONS.minCoverageRatioForced,
    requiredValidFrames: Math.max(1, options?.requiredValidFrames ?? DEFAULT_OPTIONS.requiredValidFrames),
    smoothingAlpha: Math.max(0.01, Math.min(1, options?.smoothingAlpha ?? DEFAULT_OPTIONS.smoothingAlpha))
  };
}

function resolveSegmentPoint(from: JointPoint, to: JointPoint, ratio: number) {
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio
  };
}

export function estimateCenterOfGravity(frame: PoseFrame, options?: { minJointConfidence?: number }): CenterOfGravityEstimate | null {
  const minJointConfidence = options?.minJointConfidence ?? DEFAULT_OPTIONS.minJointConfidence;
  let weightedX = 0;
  let weightedY = 0;
  let includedWeight = 0;
  let usedSegmentCount = 0;
  let hasCoreSegment = false;

  for (const segment of SEGMENTS) {
    const from = frame.joints[segment.from];
    const to = frame.joints[segment.to];
    if (!from || !to) {
      continue;
    }
    if ((from.confidence ?? 1) < minJointConfidence || (to.confidence ?? 1) < minJointConfidence) {
      continue;
    }

    const point = resolveSegmentPoint(from, to, segment.ratio);
    weightedX += point.x * segment.weight;
    weightedY += point.y * segment.weight;
    includedWeight += segment.weight;
    usedSegmentCount += 1;
    if (segment.core) {
      hasCoreSegment = true;
    }
  }

  if (includedWeight <= 0 || usedSegmentCount === 0) {
    return null;
  }

  return {
    x: weightedX / includedWeight,
    y: weightedY / includedWeight,
    coverageRatio: includedWeight / TOTAL_SEGMENT_WEIGHT,
    usedSegmentCount,
    hasCoreSegment
  };
}

export type CenterOfGravityTracker = {
  resolve(frame: PoseFrame | undefined, options?: { forceVisible?: boolean }): CenterOfGravityRenderDecision;
  reset(): void;
};

export function createCenterOfGravityTracker(options?: CenterOfGravityTrackerOptions): CenterOfGravityTracker {
  const config = resolveOptions(options);
  let consecutiveValidFrames = 0;
  let lastTimestampMs: number | null = null;
  let smoothedPoint: { x: number; y: number } | null = null;

  const reset = () => {
    consecutiveValidFrames = 0;
    lastTimestampMs = null;
    smoothedPoint = null;
  };

  return {
    resolve(frame, stateOptions) {
      if (!frame) {
        return { visible: false, point: null, coverageRatio: 0, usedSegmentCount: 0, reason: "insufficient_pose_data" };
      }

      if (lastTimestampMs !== null && frame.timestampMs + 2 < lastTimestampMs) {
        reset();
        lastTimestampMs = frame.timestampMs;
        return { visible: false, point: null, coverageRatio: 0, usedSegmentCount: 0, reason: "seek_reset" };
      }
      lastTimestampMs = frame.timestampMs;

      const estimate = estimateCenterOfGravity(frame, { minJointConfidence: config.minJointConfidence });
      if (!estimate) {
        consecutiveValidFrames = 0;
        return { visible: false, point: null, coverageRatio: 0, usedSegmentCount: 0, reason: "insufficient_pose_data" };
      }

      if (!estimate.hasCoreSegment) {
        consecutiveValidFrames = 0;
        return {
          visible: false,
          point: null,
          coverageRatio: estimate.coverageRatio,
          usedSegmentCount: estimate.usedSegmentCount,
          reason: "insufficient_core_segments"
        };
      }

      const minCoverageRatio = stateOptions?.forceVisible ? config.minCoverageRatioForced : config.minCoverageRatio;
      if (estimate.coverageRatio < minCoverageRatio) {
        consecutiveValidFrames = 0;
        return {
          visible: false,
          point: null,
          coverageRatio: estimate.coverageRatio,
          usedSegmentCount: estimate.usedSegmentCount,
          reason: "insufficient_coverage"
        };
      }

      consecutiveValidFrames += 1;
      if (consecutiveValidFrames < config.requiredValidFrames) {
        return {
          visible: false,
          point: null,
          coverageRatio: estimate.coverageRatio,
          usedSegmentCount: estimate.usedSegmentCount,
          reason: "warming_up"
        };
      }

      const nextPoint = smoothedPoint
        ? {
            x: smoothedPoint.x + (estimate.x - smoothedPoint.x) * config.smoothingAlpha,
            y: smoothedPoint.y + (estimate.y - smoothedPoint.y) * config.smoothingAlpha
          }
        : { x: estimate.x, y: estimate.y };
      smoothedPoint = nextPoint;

      return {
        visible: true,
        point: nextPoint,
        coverageRatio: estimate.coverageRatio,
        usedSegmentCount: estimate.usedSegmentCount,
        reason: null
      };
    },
    reset
  };
}
