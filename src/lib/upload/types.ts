import type { CanonicalJointName, PortableDrill } from "@/lib/schema/contracts";

export type UploadJobDrillSelection = {
  drill?: PortableDrill;
  drillVersion?: string;
  mode?: "freestyle" | "drill";
  drillBinding: {
    drillId?: string;
    drillName: string;
    drillVersion?: string;
    sourceKind: "freestyle" | "seeded" | "local" | "hosted" | "unknown";
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
  drillSelection: UploadJobDrillSelection;
  artefacts?: UploadJobArtifacts;
};

export type PoseFrame = {
  timestampMs: number;
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
  poseTimeline: PoseTimeline;
  processingSummary: {
    schemaVersion: "upload-analysis-v1";
    averageConfidence: number;
    sampledFrameCount: number;
    durationMs: number;
  };
  annotatedVideoBlob?: Blob;
  annotatedVideoMimeType?: string;
};
