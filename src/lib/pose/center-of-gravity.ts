import type { CanonicalJointName } from "@/lib/schema/contracts";
import type { DrillCameraView } from "@/lib/analysis/camera-view";
import type { PoseFrame } from "@/lib/upload/types";

export type Point2D = { x: number; y: number };

type JointPoint = { x: number; y: number; confidence?: number };

type SegmentDefinition = {
  weight: number;
  resolve: (joints: PoseFrame["joints"], minConfidence: number) => Point2D | null;
};

const DEFAULT_MIN_CONFIDENCE = 0.45;
const MIN_SEGMENT_COUNT = 4;
const MIN_WEIGHT_COVERAGE = 0.52;

function getJoint(joints: PoseFrame["joints"], jointName: CanonicalJointName, minConfidence: number): JointPoint | null {
  const joint = joints[jointName];
  if (!joint) {
    return null;
  }
  if ((joint.confidence ?? 1) < minConfidence) {
    return null;
  }
  return joint;
}

function midpoint(a: JointPoint, b: JointPoint): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function midpointByName(
  joints: PoseFrame["joints"],
  a: CanonicalJointName,
  b: CanonicalJointName,
  minConfidence: number
): Point2D | null {
  const from = getJoint(joints, a, minConfidence);
  const to = getJoint(joints, b, minConfidence);
  if (!from || !to) {
    return null;
  }
  return midpoint(from, to);
}

function weightedMidpoint(a: Point2D, b: Point2D, aWeight: number): Point2D {
  const normalizedA = Math.min(1, Math.max(0, aWeight));
  const normalizedB = 1 - normalizedA;
  return {
    x: a.x * normalizedA + b.x * normalizedB,
    y: a.y * normalizedA + b.y * normalizedB
  };
}

const SEGMENTS: SegmentDefinition[] = [
  {
    weight: 0.08,
    resolve: (joints, minConfidence) => {
      const nose = getJoint(joints, "nose", minConfidence);
      const shoulderMid = midpointByName(joints, "leftShoulder", "rightShoulder", minConfidence);
      if (!nose || !shoulderMid) {
        return null;
      }
      // Pull the head estimate slightly below the nose for a neck/head center approximation.
      return weightedMidpoint({ x: nose.x, y: nose.y }, shoulderMid, 0.7);
    }
  },
  {
    weight: 0.42,
    resolve: (joints, minConfidence) => {
      const shoulderMid = midpointByName(joints, "leftShoulder", "rightShoulder", minConfidence);
      const hipMid = midpointByName(joints, "leftHip", "rightHip", minConfidence);
      if (!shoulderMid || !hipMid) {
        return null;
      }
      return midpoint(shoulderMid, hipMid);
    }
  },
  { weight: 0.03, resolve: (joints, minConfidence) => midpointByName(joints, "leftShoulder", "leftElbow", minConfidence) },
  { weight: 0.03, resolve: (joints, minConfidence) => midpointByName(joints, "rightShoulder", "rightElbow", minConfidence) },
  { weight: 0.02, resolve: (joints, minConfidence) => midpointByName(joints, "leftElbow", "leftWrist", minConfidence) },
  { weight: 0.02, resolve: (joints, minConfidence) => midpointByName(joints, "rightElbow", "rightWrist", minConfidence) },
  { weight: 0.11, resolve: (joints, minConfidence) => midpointByName(joints, "leftHip", "leftKnee", minConfidence) },
  { weight: 0.11, resolve: (joints, minConfidence) => midpointByName(joints, "rightHip", "rightKnee", minConfidence) },
  { weight: 0.07, resolve: (joints, minConfidence) => midpointByName(joints, "leftKnee", "leftAnkle", minConfidence) },
  { weight: 0.07, resolve: (joints, minConfidence) => midpointByName(joints, "rightKnee", "rightAnkle", minConfidence) },
  // MediaPipe canonical contract here has ankle but no toe/heel, so ankle is the feet proxy.
  { weight: 0.02, resolve: (joints, minConfidence) => getJoint(joints, "leftAnkle", minConfidence) },
  { weight: 0.02, resolve: (joints, minConfidence) => getJoint(joints, "rightAnkle", minConfidence) }
];

export function estimateCenterOfGravity2D(
  frame: Pick<PoseFrame, "joints">,
  options?: {
    minConfidence?: number;
    minSegmentCount?: number;
    minWeightCoverage?: number;
  }
): Point2D | null {
  const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const minSegmentCount = options?.minSegmentCount ?? MIN_SEGMENT_COUNT;
  const minWeightCoverage = options?.minWeightCoverage ?? MIN_WEIGHT_COVERAGE;

  let includedSegmentCount = 0;
  let includedWeight = 0;
  let weightedX = 0;
  let weightedY = 0;

  for (const segment of SEGMENTS) {
    const center = segment.resolve(frame.joints, minConfidence);
    if (!center) {
      continue;
    }
    includedSegmentCount += 1;
    includedWeight += segment.weight;
    weightedX += center.x * segment.weight;
    weightedY += center.y * segment.weight;
  }

  if (includedSegmentCount < minSegmentCount || includedWeight < minWeightCoverage || includedWeight <= 0) {
    return null;
  }

  return {
    x: weightedX / includedWeight,
    y: weightedY / includedWeight
  };
}

export class TemporalPointSmoother {
  private previous: Point2D | null = null;
  private readonly alpha: number;

  constructor(alpha = 0.38) {
    this.alpha = alpha;
  }

  reset(): void {
    this.previous = null;
  }

  next(point: Point2D): Point2D {
    if (!this.previous) {
      this.previous = point;
      return point;
    }
    const clampedAlpha = Math.max(0.05, Math.min(1, this.alpha));
    const smoothed = {
      x: this.previous.x + (point.x - this.previous.x) * clampedAlpha,
      y: this.previous.y + (point.y - this.previous.y) * clampedAlpha
    };
    this.previous = smoothed;
    return smoothed;
  }
}

export type CenterOfGravityOverlayState = {
  smoother: TemporalPointSmoother;
  visible: boolean;
  stableDetections: number;
  unstableDetections: number;
  lastStablePoint: Point2D | null;
};

export function createCenterOfGravityOverlayState(): CenterOfGravityOverlayState {
  return {
    smoother: new TemporalPointSmoother(),
    visible: false,
    stableDetections: 0,
    unstableDetections: 0,
    lastStablePoint: null
  };
}

export function resetCenterOfGravityOverlayState(state: CenterOfGravityOverlayState): void {
  state.smoother.reset();
  state.visible = false;
  state.stableDetections = 0;
  state.unstableDetections = 0;
  state.lastStablePoint = null;
}

export function shouldRenderCenterOfGravity(options: {
  mode?: "drill" | "freestyle";
  cameraView?: DrillCameraView;
  allowFreestyle?: boolean;
}): boolean {
  if (options.mode === "drill") {
    return options.cameraView === "front" || options.cameraView === "side";
  }
  if (options.mode === "freestyle") {
    return Boolean(options.allowFreestyle && options.cameraView);
  }
  return false;
}

export function resolveSmoothedCenterOfGravity(
  frame: Pick<PoseFrame, "joints">,
  state: CenterOfGravityOverlayState,
  options?: {
    minConfidence?: number;
    visibleEnterFrames?: number;
    hiddenExitFrames?: number;
  }
): Point2D | null {
  const enterFrames = options?.visibleEnterFrames ?? 2;
  const exitFrames = options?.hiddenExitFrames ?? 4;
  const estimate = estimateCenterOfGravity2D(frame, { minConfidence: options?.minConfidence });

  if (!estimate) {
    state.stableDetections = 0;
    state.unstableDetections += 1;
    if (state.visible && state.unstableDetections <= exitFrames && state.lastStablePoint) {
      return state.lastStablePoint;
    }
    resetCenterOfGravityOverlayState(state);
    return null;
  }

  state.unstableDetections = 0;
  state.stableDetections += 1;
  if (!state.visible && state.stableDetections < enterFrames) {
    return null;
  }

  if (!state.visible) {
    state.visible = true;
    state.smoother.reset();
  }

  const smoothed = state.smoother.next(estimate);
  state.lastStablePoint = smoothed;
  return smoothed;
}
