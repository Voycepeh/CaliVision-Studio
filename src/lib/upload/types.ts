import type { CanonicalJointName, PortableDrill } from "@/lib/schema/contracts";
import type { DrillCameraView } from "@/lib/analysis/camera-view";
import type { UploadCompatibilityReport } from "@/lib/upload/compatibility";

export type UploadJobDrillSelection = {
  drill?: PortableDrill;
  drillVersion?: string;
  mode?: "freestyle" | "drill";
  cameraView?: DrillCameraView;
  drillBinding: {
    drillId?: string;
    drillName: string;
    drillVersion?: string;
    sourceKind: "freestyle" | "seeded" | "local" | "hosted" | "exchange" | "unknown";
    sourceId?: string;
    sourceLabel?: string;
  };
};

export type UploadJobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export type UploadJob = {
  id: string;
  file: File;
  fileName: string;
  fileSizeBytes: number;
  durationMs?: number;
  status: UploadJobStatus;
  stageLabel: string;
  progress: number;
  errorMessage?: string;
  errorDetails?: string;
  createdAtIso: string;
  startedAtIso?: string;
  completedAtIso?: string;
  compatibility?: UploadCompatibilityReport;
  preflightChoice?: "auto" | "normalize" | "try_anyway";
  drillSelection: UploadJobDrillSelection;
  artefacts?: UploadJobArtifacts;
};

export type PoseFrame = {
  timestampMs: number;
  frameWidth?: number;
  frameHeight?: number;
  mirrored?: boolean;
  joints: Partial<Record<CanonicalJointName, { x: number; y: number; confidence?: number }>>;
};

export type PoseTimeline = {
  schemaVersion: "upload-video-v1";
  detector: "mediapipe-pose-landmarker";
  cadenceFps: number;
  video: {
    fileName: string;
    width: number;
    height: number;
    durationMs: number;
    sizeBytes: number;
    mimeType: string;
  };
  frames: PoseFrame[];
  generatedAtIso: string;
};

export type UploadJobArtifacts = {
  analysisSourceKind?: "original" | "normalized";
  analysisVideoFile?: File;
  poseTimeline: PoseTimeline;
  processingSummary: {
    schemaVersion: "upload-analysis-v1";
    averageConfidence: number;
    sampledFrameCount: number;
    durationMs: number;
    exportDiagnostics?: {
      sourceDurationSec: number;
      analyzedDurationSec: number;
      renderedFrameCount: number;
      renderFpsTarget: number;
      firstFrameTsMs: number | null;
      lastFrameTsMs: number | null;
      expectedOutputDurationSec: number;
      actualOutputDurationSec: number | null;
      durationDriftSec: number | null;
      durationDriftPct: number | null;
      exportContainerType: string;
      durationDriftWarning: boolean;
      durationDriftWarningMessage?: string;
    };
  };
  annotatedVideoBlob?: Blob;
  annotatedVideoMimeType?: string;
};
