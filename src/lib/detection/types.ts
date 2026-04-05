import type { CanonicalJointName } from "@/lib/schema/contracts";

export type DetectionJoint = {
  joint: CanonicalJointName;
  x: number;
  y: number;
  confidence: number;
  visibility?: number;
};

export type DetectionIssueCode =
  | "detector-unavailable"
  | "detector-load-failed"
  | "no-pose-detected"
  | "partial-pose"
  | "low-confidence"
  | "invalid-coordinate"
  | "missing-joint";

export type DetectionIssue = {
  code: DetectionIssueCode;
  severity: "warning" | "error";
  message: string;
  joint?: CanonicalJointName;
};

export type DetectionConfidence = {
  averageJointConfidence: number;
  minJointConfidence: number;
  maxJointConfidence: number;
  belowThresholdCount: number;
};

export type DetectionMetadata = {
  detector: "mediapipe-pose-landmarker";
  detectorVersion: string;
  model: "pose_landmarker_lite";
  imageWidth: number;
  imageHeight: number;
  elapsedMs: number;
  generatedAtIso: string;
};

export type DetectionResult = {
  status: "success" | "partial" | "failed";
  joints: Partial<Record<CanonicalJointName, DetectionJoint>>;
  confidence: DetectionConfidence;
  coverage: {
    detectedJoints: number;
    totalCanonicalJoints: number;
  };
  issues: DetectionIssue[];
  metadata: DetectionMetadata;
};
