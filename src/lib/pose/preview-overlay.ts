import type { CanonicalJointName, PortableViewType } from "@/lib/schema/contracts";

export const PREVIEW_OVERLAY_STYLE = {
  skeletonBase: "#7CF0A9",
  nose: "#00FF00",
  hip: "#FF0000",
  idealLine: "rgba(0, 255, 255, 0.45)",
  jointRadiusBase: 10,
  jointRadiusLargeMultiplier: 2,
  skeletonStrokeWidth: 6,
  idealLineStrokeWidth: 2
} as const;

export type PreviewJointRole = "base" | "nose" | "hip";

export type SkeletonConnection = {
  from: CanonicalJointName;
  to: CanonicalJointName;
};

const LEFT_CHAIN_JOINTS: CanonicalJointName[] = [
  "leftShoulder",
  "leftElbow",
  "leftWrist",
  "leftHip",
  "leftKnee",
  "leftAnkle"
];

const RIGHT_CHAIN_JOINTS: CanonicalJointName[] = [
  "rightShoulder",
  "rightElbow",
  "rightWrist",
  "rightHip",
  "rightKnee",
  "rightAnkle"
];

const LEFT_CHAIN_CONNECTIONS: SkeletonConnection[] = [
  { from: "nose", to: "leftShoulder" },
  { from: "leftShoulder", to: "leftElbow" },
  { from: "leftElbow", to: "leftWrist" },
  { from: "leftShoulder", to: "leftHip" },
  { from: "leftHip", to: "leftKnee" },
  { from: "leftKnee", to: "leftAnkle" }
];

const RIGHT_CHAIN_CONNECTIONS: SkeletonConnection[] = [
  { from: "nose", to: "rightShoulder" },
  { from: "rightShoulder", to: "rightElbow" },
  { from: "rightElbow", to: "rightWrist" },
  { from: "rightShoulder", to: "rightHip" },
  { from: "rightHip", to: "rightKnee" },
  { from: "rightKnee", to: "rightAnkle" }
];

const BILATERAL_CONNECTORS: SkeletonConnection[] = [
  { from: "leftShoulder", to: "rightShoulder" },
  { from: "leftHip", to: "rightHip" }
];

function resolveProfileSide(view: PortableViewType): "left" | "right" | null {
  if (view !== "side") {
    return null;
  }

  return "left";
}

export function getPreviewJointNames(view: PortableViewType): CanonicalJointName[] {
  const side = resolveProfileSide(view);
  if (side === "left") {
    return ["nose", ...LEFT_CHAIN_JOINTS];
  }

  if (side === "right") {
    return ["nose", ...RIGHT_CHAIN_JOINTS];
  }

  return ["nose", ...LEFT_CHAIN_JOINTS, ...RIGHT_CHAIN_JOINTS];
}

export function getPreviewConnections(view: PortableViewType): SkeletonConnection[] {
  const side = resolveProfileSide(view);
  if (side === "left") {
    return LEFT_CHAIN_CONNECTIONS;
  }

  if (side === "right") {
    return RIGHT_CHAIN_CONNECTIONS;
  }

  return [...LEFT_CHAIN_CONNECTIONS, ...RIGHT_CHAIN_CONNECTIONS, ...BILATERAL_CONNECTORS];
}

export function getPreviewJointRole(jointName: CanonicalJointName): PreviewJointRole {
  if (jointName === "nose") {
    return "nose";
  }

  if (jointName === "leftHip" || jointName === "rightHip") {
    return "hip";
  }

  return "base";
}

