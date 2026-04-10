import type { CanonicalJointName, PortableJointPoint, PortablePose } from "../schema/contracts.ts";
import type { DrillCameraView } from "./camera-view.ts";
import type { PoseFrame } from "../upload/types.ts";

type JointMap = Partial<Record<CanonicalJointName, PortableJointPoint | { x: number; y: number; confidence?: number }>>;

export type PoseNormalizationDebug = {
  mirrorApplied: boolean;
  aspectRatio: number;
  origin: { x: number; y: number; strategy: "hip-center" | "nose" | "fallback" };
  scale: { value: number; strategy: "torso-length" | "body-width" | "fallback" };
};

export type NormalizedPose = {
  joints: Partial<Record<CanonicalJointName, { x: number; y: number; confidence?: number }>>;
  debug: PoseNormalizationDebug;
};

export function normalizePoseForScoring(
  joints: JointMap,
  options: {
    aspectRatio?: number;
    mirrored?: boolean;
    cameraView: DrillCameraView;
  }
): NormalizedPose {
  const mirrorApplied = Boolean(options.mirrored) && options.cameraView === "front";
  const aspectRatio = sanitizeAspectRatio(options.aspectRatio);
  const origin = chooseOrigin(joints, mirrorApplied, aspectRatio);
  const scale = chooseScale(joints, mirrorApplied, aspectRatio);
  const normalizedJoints = Object.entries(joints).reduce<NormalizedPose["joints"]>((acc, [jointName, joint]) => {
    if (!joint) return acc;
    const adjusted = adjustPoint(joint, mirrorApplied, aspectRatio);
    acc[jointName as CanonicalJointName] = {
      x: (adjusted.x - origin.x) / scale.value,
      y: (adjusted.y - origin.y) / scale.value,
      confidence: "confidence" in joint ? joint.confidence : undefined
    };
    return acc;
  }, {});

  return {
    joints: normalizedJoints,
    debug: {
      mirrorApplied,
      aspectRatio,
      origin,
      scale
    }
  };
}

export function getPoseAspectRatio(frameOrPose: PoseFrame | PortablePose): number {
  if ("frameWidth" in frameOrPose) {
    const width = frameOrPose.frameWidth ?? 0;
    const height = frameOrPose.frameHeight ?? 0;
    return sanitizeAspectRatio(width > 0 && height > 0 ? width / height : 1);
  }
  const width = ("canvas" in frameOrPose ? frameOrPose.canvas?.widthRef : 1) ?? 1;
  const height = ("canvas" in frameOrPose ? frameOrPose.canvas?.heightRef : 1) ?? 1;
  return sanitizeAspectRatio(width > 0 && height > 0 ? width / height : 1);
}

function chooseOrigin(joints: JointMap, mirrored: boolean, aspectRatio: number): PoseNormalizationDebug["origin"] {
  const hipCenter = midpoint(joints.leftHip, joints.rightHip, mirrored, aspectRatio);
  if (hipCenter) {
    return { ...hipCenter, strategy: "hip-center" };
  }
  const nose = joints.nose ? adjustPoint(joints.nose, mirrored, aspectRatio) : null;
  if (nose) {
    return { ...nose, strategy: "nose" };
  }
  return { x: 0.5 * aspectRatio, y: 0.5, strategy: "fallback" };
}

function chooseScale(joints: JointMap, mirrored: boolean, aspectRatio: number): PoseNormalizationDebug["scale"] {
  const hipCenter = midpoint(joints.leftHip, joints.rightHip, mirrored, aspectRatio);
  const shoulderCenter = midpoint(joints.leftShoulder, joints.rightShoulder, mirrored, aspectRatio);
  if (hipCenter && shoulderCenter) {
    return { value: Math.max(0.08, Math.hypot(hipCenter.x - shoulderCenter.x, hipCenter.y - shoulderCenter.y)), strategy: "torso-length" };
  }
  const hipWidth = distance(joints.leftHip, joints.rightHip, mirrored, aspectRatio);
  const shoulderWidth = distance(joints.leftShoulder, joints.rightShoulder, mirrored, aspectRatio);
  const bodyWidth = Math.max(hipWidth, shoulderWidth);
  if (bodyWidth > 0.01) {
    return { value: Math.max(0.08, bodyWidth), strategy: "body-width" };
  }
  return { value: 0.3, strategy: "fallback" };
}

function midpoint(a: JointMap[CanonicalJointName], b: JointMap[CanonicalJointName], mirrored: boolean, aspectRatio: number) {
  if (!a || !b) return null;
  const pa = adjustPoint(a, mirrored, aspectRatio);
  const pb = adjustPoint(b, mirrored, aspectRatio);
  return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
}

function distance(a: JointMap[CanonicalJointName], b: JointMap[CanonicalJointName], mirrored: boolean, aspectRatio: number) {
  const m = midpoint(a, b, mirrored, aspectRatio);
  if (!m || !a) return 0;
  const pa = adjustPoint(a, mirrored, aspectRatio);
  return Math.hypot(pa.x - m.x, pa.y - m.y) * 2;
}

function adjustPoint(point: PortableJointPoint | { x: number; y: number }, mirrored: boolean, aspectRatio: number) {
  const x = mirrored ? 1 - point.x : point.x;
  return { x: x * aspectRatio, y: point.y };
}

function sanitizeAspectRatio(aspectRatio: number | undefined): number {
  if (!Number.isFinite(aspectRatio) || !aspectRatio || aspectRatio <= 0) {
    return 1;
  }
  return Math.max(0.25, Math.min(4, aspectRatio));
}
