export type SchemaVersion = "0.1.0";

export type PortableViewType = "front" | "side" | "rear" | "three-quarter";

export type CanonicalJointName =
  | "nose"
  | "leftEye"
  | "rightEye"
  | "leftEar"
  | "rightEar"
  | "leftShoulder"
  | "rightShoulder"
  | "leftElbow"
  | "rightElbow"
  | "leftWrist"
  | "rightWrist"
  | "leftHip"
  | "rightHip"
  | "leftKnee"
  | "rightKnee"
  | "leftAnkle"
  | "rightAnkle";

export type PortableCanvasSpec = {
  coordinateSystem: "normalized-2d";
  widthRef: number;
  heightRef: number;
  view: PortableViewType;
};

export type PortableJointPoint = {
  x: number;
  y: number;
  confidence?: number;
};

export type PortablePose = {
  poseId: string;
  timestampMs: number;
  joints: Partial<Record<CanonicalJointName, PortableJointPoint>>;
  canvas: PortableCanvasSpec;
};

export type PortableAssetRef = {
  assetId: string;
  type: "image" | "video" | "audio" | "overlay";
  uri: string;
  checksumSha256?: string;
  mimeType?: string;
  byteSize?: number;
};

export type PortablePhase = {
  phaseId: string;
  order: number;
  title: string;
  summary?: string;
  durationMs: number;
  startOffsetMs?: number;
  poseSequence: PortablePose[];
  assetRefs: PortableAssetRef[];
};

export type PortableDrill = {
  drillId: string;
  slug: string;
  title: string;
  description?: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  defaultView: PortableViewType;
  phases: PortablePhase[];
};

export type DrillManifest = {
  schemaVersion: SchemaVersion;
  packageId: string;
  packageVersion: string;
  createdAtIso: string;
  updatedAtIso: string;
  source: "web-studio" | "android-export";
  compatibility: {
    androidMinVersion: string;
    androidTargetContract: string;
  };
};

export type DrillPackage = {
  manifest: DrillManifest;
  drills: PortableDrill[];
  assets: PortableAssetRef[];
};
