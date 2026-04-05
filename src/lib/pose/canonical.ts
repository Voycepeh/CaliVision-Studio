import type { CanonicalJointName } from "@/lib/schema/contracts";

export type CanonicalJointSide = "left" | "right" | "center";

export type CanonicalJointDefinition = {
  name: CanonicalJointName;
  label: string;
  side: CanonicalJointSide;
  order: number;
};

export const CANONICAL_JOINTS: CanonicalJointDefinition[] = [
  { name: "nose", label: "Nose", side: "center", order: 1 },
  { name: "leftEye", label: "Left Eye", side: "left", order: 2 },
  { name: "rightEye", label: "Right Eye", side: "right", order: 3 },
  { name: "leftEar", label: "Left Ear", side: "left", order: 4 },
  { name: "rightEar", label: "Right Ear", side: "right", order: 5 },
  { name: "leftShoulder", label: "Left Shoulder", side: "left", order: 6 },
  { name: "rightShoulder", label: "Right Shoulder", side: "right", order: 7 },
  { name: "leftElbow", label: "Left Elbow", side: "left", order: 8 },
  { name: "rightElbow", label: "Right Elbow", side: "right", order: 9 },
  { name: "leftWrist", label: "Left Wrist", side: "left", order: 10 },
  { name: "rightWrist", label: "Right Wrist", side: "right", order: 11 },
  { name: "leftHip", label: "Left Hip", side: "left", order: 12 },
  { name: "rightHip", label: "Right Hip", side: "right", order: 13 },
  { name: "leftKnee", label: "Left Knee", side: "left", order: 14 },
  { name: "rightKnee", label: "Right Knee", side: "right", order: 15 },
  { name: "leftAnkle", label: "Left Ankle", side: "left", order: 16 },
  { name: "rightAnkle", label: "Right Ankle", side: "right", order: 17 }
];

export const CANONICAL_JOINT_NAMES = CANONICAL_JOINTS.map((joint) => joint.name);

export const CANONICAL_JOINT_NAME_SET = new Set<CanonicalJointName>(CANONICAL_JOINT_NAMES);

export type SkeletonConnection = {
  from: CanonicalJointName;
  to: CanonicalJointName;
};

export const CANONICAL_SKELETON_CONNECTIONS: SkeletonConnection[] = [
  { from: "leftEye", to: "nose" },
  { from: "rightEye", to: "nose" },
  { from: "leftEye", to: "leftEar" },
  { from: "rightEye", to: "rightEar" },
  { from: "leftShoulder", to: "rightShoulder" },
  { from: "leftShoulder", to: "leftElbow" },
  { from: "leftElbow", to: "leftWrist" },
  { from: "rightShoulder", to: "rightElbow" },
  { from: "rightElbow", to: "rightWrist" },
  { from: "leftShoulder", to: "leftHip" },
  { from: "rightShoulder", to: "rightHip" },
  { from: "leftHip", to: "rightHip" },
  { from: "leftHip", to: "leftKnee" },
  { from: "leftKnee", to: "leftAnkle" },
  { from: "rightHip", to: "rightKnee" },
  { from: "rightKnee", to: "rightAnkle" }
];
