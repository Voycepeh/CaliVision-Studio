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

export type PortableAnalysisMeasurementType = "rep" | "hold" | "hybrid";

export type PortablePhaseSemanticRole = "start" | "bottom" | "top" | "lockout" | "transition" | "hold";

export type PortablePhaseMatchHints = {
  requiredJoints?: CanonicalJointName[];
  optionalJoints?: CanonicalJointName[];
  toleranceProfile?: "strict" | "balanced" | "lenient" | string;
  viewHint?: PortableViewType | "auto" | string;
};

export type PortablePhaseAnalysis = {
  semanticRole?: PortablePhaseSemanticRole;
  isCritical?: boolean;
  matchHints?: PortablePhaseMatchHints;
};

export type PortableAllowedPhaseSkip = {
  fromPhaseId: string;
  toPhaseId: string;
  skippedPhaseIds: string[];
};

export type PortableDrillAnalysis = {
  measurementType: PortableAnalysisMeasurementType;
  orderedPhaseSequence: string[];
  criticalPhaseIds: string[];
  allowedPhaseSkips: PortableAllowedPhaseSkip[];
  minimumConfirmationFrames: number;
  exitGraceFrames: number;
  minimumRepDurationMs: number;
  maximumRepDurationMs?: number;
  cooldownMs: number;
  targetHoldPhaseId?: string;
  entryConfirmationFrames: number;
  minimumHoldDurationMs: number;
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
  analysis?: PortablePhaseAnalysis;
};

export type PortableDrill = {
  drillId: string;
  slug: string;
  title: string;
  drillType: "hold" | "rep";
  description?: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  defaultView: PortableViewType;
  thumbnailAssetId?: string;
  previewAssetId?: string;
  phases: PortablePhase[];
  analysis?: PortableDrillAnalysis;
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

export type AnalysisSourceInfo = {
  sourceType: "upload-video" | "live-stream" | "manual";
  sourceLabel?: string;
  capturedFps?: number;
};

export type AnalysisSummaryMetrics = {
  repCount?: number;
  holdDurationMs?: number;
  invalidTransitionCount?: number;
  partialAttemptCount?: number;
  analyzedDurationMs?: number;
  detectedPhaseCoverage?: number;
  confidenceAvg?: number;
  lowConfidenceFrames?: number;
};

export type FramePhaseSample = {
  timestampMs: number;
  classifiedPhaseId?: string;
  confidence: number;
  perPhaseScores?: Record<string, number>;
};

export type AnalysisEventType =
  | "phase_enter"
  | "phase_exit"
  | "rep_complete"
  | "hold_start"
  | "hold_end"
  | "invalid_transition"
  | "partial_attempt";

export type AnalysisEvent = {
  eventId: string;
  timestampMs: number;
  type: AnalysisEventType;
  phaseId?: string;
  fromPhaseId?: string;
  toPhaseId?: string;
  repIndex?: number;
  details?: Record<string, string | number | boolean>;
};

export type AnalysisSession = {
  sessionId: string;
  drillId: string;
  drillVersion?: string;
  source: AnalysisSourceInfo;
  startedAtIso: string;
  completedAtIso?: string;
  summary: AnalysisSummaryMetrics;
  annotatedVideoUri?: string;
  frameSamples: FramePhaseSample[];
  events: AnalysisEvent[];
};
