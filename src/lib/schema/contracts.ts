export type SchemaVersion = "0.1.0";

export type PortableViewType = "front" | "side" | "rear";

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

export type PortableAssetType = "image" | "video" | "audio" | "overlay";

export type PortableAssetRole = "phase-source-image" | "drill-thumbnail" | "drill-preview";

export type PortableAssetRef = {
  assetId: string;
  type: PortableAssetType;
  role?: PortableAssetRole;
  uri: string;
  checksumSha256?: string;
  mimeType?: string;
  byteSize?: number;
  ownerDrillId?: string;
  ownerPhaseId?: string;
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
  thumbnailAssetId?: string;
  previewAssetId?: string;
  phases: PortablePhase[];
};


export type DrillPackagePublishingMetadata = {
  title?: string;
  summary?: string;
  description?: string;
  authorDisplayName?: string;
  tags?: string[];
  categories?: string[];
  visibility?: "private" | "unlisted" | "public";
  publishStatus?: "draft" | "published";
  latestArtifactChecksumSha256?: string;
  lastPreparedAtIso?: string;
};

export type DrillPackageDraftStatus = "draft" | "publish-ready";

export type DrillPackageRelationType = "fork" | "remix" | "duplicate" | "new-version" | "import";

export type DrillPackageProvenance = {
  relation: DrillPackageRelationType;
  parentPackageId: string;
  parentVersionId?: string;
  parentEntryId?: string;
  note?: string;
};

export type DrillPackageVersioningMetadata = {
  packageSlug: string;
  versionId: string;
  revision: number;
  lineageId: string;
  draftStatus: DrillPackageDraftStatus;
  derivedFrom?: DrillPackageProvenance;
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
  versioning?: DrillPackageVersioningMetadata;
  publishing?: DrillPackagePublishingMetadata;
};

export type DrillPackage = {
  manifest: DrillManifest;
  drills: PortableDrill[];
  assets: PortableAssetRef[];
};

export type DrillBundleManifestAsset = {
  assetId: string;
  role: PortableAssetRole;
  type: PortableAssetType;
  ownerDrillId?: string;
  ownerPhaseId?: string;
  path: string;
  mimeType: string;
  byteSize: number;
};

export type DrillBundleManifest = {
  bundleVersion: "1";
  packageId: string;
  packageVersion: string;
  createdAtIso: string;
  drillPath: "drill.json";
  assets: DrillBundleManifestAsset[];
};

export type DrillBundleAssetFile = {
  path: string;
  mimeType: string;
  byteSize: number;
  base64Data: string;
};

export type DrillBundleFile = {
  manifest: DrillBundleManifest;
  drill: DrillPackage;
  files: DrillBundleAssetFile[];
};
