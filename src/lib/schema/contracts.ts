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
  comparison?: PortablePhaseComparisonRule;
};

export type PortablePhaseComparisonRule = {
  required?: boolean;
  durationRelevant?: boolean;
  holdRequired?: boolean;
  minHoldDurationMs?: number;
  targetHoldDurationMs?: number;
  criteriaHooks?: string[];
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

export type DrillBenchmarkSourceType =
  | "none"
  | "builtin"
  | "seeded"
  | "reference_pose_sequence"
  | "reference_session"
  | "reference_video";

export type DrillBenchmarkMovementType = "rep" | "hold";

export type DrillBenchmarkPhase = {
  key: string;
  label?: string;
  order: number;
  pose?: PortablePose;
  targetDurationMs?: number;
  notes?: string;
};

export type DrillBenchmarkTiming = {
  expectedRepDurationMs?: number;
  targetHoldDurationMs?: number;
  phaseDurationsMs?: Record<string, number>;
};

export type DrillBenchmarkScoringProfile = {
  profileId?: string;
  label?: string;
  thresholdByMetric?: Record<string, number>;
  weightByMetric?: Record<string, number>;
};

export type DrillBenchmarkMedia = {
  referenceSessionId?: string;
  referenceVideoAssetId?: string;
  referenceVideoUri?: string;
  notes?: string;
};

export type DrillBenchmark = {
  id?: string;
  label?: string;
  description?: string;
  sourceType: DrillBenchmarkSourceType;
  movementType?: DrillBenchmarkMovementType;
  cameraView?: PortableViewType;
  phaseSequence?: DrillBenchmarkPhase[];
  timing?: DrillBenchmarkTiming;
  scoringProfile?: DrillBenchmarkScoringProfile;
  media?: DrillBenchmarkMedia;
  status?: "draft" | "ready";
};

export type PortablePhase = {
  phaseId: string;
  order: number;
  name: string;
  /** @deprecated legacy import-only alias; use name */
  title?: string;
  summary?: string;
  durationMs: number;
  startOffsetMs?: number;
  poseSequence: PortablePose[];
  assetRefs: PortableAssetRef[];
  analysis?: PortablePhaseAnalysis;
};

export type PortableDrill = {
  drillId: string;
  /** @deprecated legacy import-only alias; internal identifiers are system-generated */
  slug?: string;
  title: string;
  drillType: "hold" | "rep";
  description?: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  primaryView: PortableViewType;
  /** @deprecated legacy import-only alias; use primaryView */
  defaultView?: PortableViewType;
  thumbnailAssetId?: string;
  previewAssetId?: string;
  phases: PortablePhase[];
  analysis?: PortableDrillAnalysis;
  benchmark?: DrillBenchmark | null;
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
  scoringDebug?: {
    cameraView: "front" | "side";
    jointSubsetByPhaseId: Record<string, CanonicalJointName[]>;
    mirrorApplied: boolean;
    runtimeNormalization: {
      mirrorApplied: boolean;
      aspectRatio: number;
      origin: { x: number; y: number; strategy: string };
      scale: { value: number; strategy: string };
    };
    phaseComparisons: Record<string, {
      templateNormalization: {
        mirrorApplied: boolean;
        aspectRatio: number;
        origin: { x: number; y: number; strategy: string };
        scale: { value: number; strategy: string };
      };
      perJointDelta: Partial<Record<CanonicalJointName, number>>;
      rawScore: number;
      adjustedScore: number;
    }>;
  };
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
