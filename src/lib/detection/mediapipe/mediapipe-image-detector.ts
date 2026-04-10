import { CANONICAL_JOINT_NAMES } from "@/lib/pose/canonical";
import type { DetectionIssue, DetectionJoint, DetectionResult } from "@/lib/detection/types";
import type { CanonicalJointName } from "@/lib/schema/contracts";
import { MEDIAPIPE_CANONICAL_LANDMARK_INDEX } from "@/lib/detection/mediapipe/landmarks";

const MIN_CONFIDENCE = 0.25;
const MIN_COVERAGE_RATIO = 0.6;
// Keep the JS loader and its wasm sidecars on an immutable versioned path to avoid CDN alias drift.
const MEDIAPIPE_POSE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404";

let posePromise: Promise<MediaPipePoseLike> | null = null;

type NormalizedLandmark = {
  x: number;
  y: number;
  visibility?: number;
};

type PoseResult = {
  poseLandmarks?: NormalizedLandmark[];
};

type MediaPipePoseLike = {
  setOptions: (options: Record<string, unknown>) => void;
  onResults: (callback: (result: PoseResult) => void) => void;
  send: (input: { image: HTMLImageElement }) => Promise<void>;
};

declare global {
  interface Window {
    Pose?: new (options: { locateFile: (file: string) => string }) => MediaPipePoseLike;
  }
}

async function loadScript(src: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[data-mediapipe='${src}']`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.mediapipe = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

async function getMediaPipePose(): Promise<MediaPipePoseLike> {
  if (!posePromise) {
    posePromise = (async () => {
      await loadScript(`${MEDIAPIPE_POSE_CDN}/pose.js`);

      if (!window.Pose) {
        throw new Error("MediaPipe Pose runtime was not available in browser context.");
      }

      const pose = new window.Pose({
        locateFile: (file) => `${MEDIAPIPE_POSE_CDN}/${file}`
      });

      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      return pose;
    })();
  }

  return posePromise;
}

function clampNormalized(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isFiniteNormalized(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function mapLandmarksToDetectionJoints(landmarks: NormalizedLandmark[]): {
  joints: Partial<Record<CanonicalJointName, DetectionJoint>>;
  issues: DetectionIssue[];
} {
  const joints: Partial<Record<CanonicalJointName, DetectionJoint>> = {};
  const issues: DetectionIssue[] = [];

  CANONICAL_JOINT_NAMES.forEach((jointName) => {
    const index = MEDIAPIPE_CANONICAL_LANDMARK_INDEX[jointName];
    const landmark = landmarks[index];

    if (!landmark) {
      issues.push({ code: "missing-joint", severity: "warning", message: `Missing landmark for ${jointName}.`, joint: jointName });
      return;
    }

    if (!Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) {
      issues.push({
        code: "invalid-coordinate",
        severity: "warning",
        message: `Landmark for ${jointName} has invalid coordinates.`,
        joint: jointName
      });
      return;
    }

    const confidence = Math.max(0, Math.min(1, landmark.visibility ?? 0.75));

    if (!isFiniteNormalized(landmark.x) || !isFiniteNormalized(landmark.y)) {
      issues.push({
        code: "invalid-coordinate",
        severity: "warning",
        message: `Landmark for ${jointName} was outside normalized bounds and was clamped.`,
        joint: jointName
      });
    }

    joints[jointName] = {
      joint: jointName,
      x: clampNormalized(landmark.x),
      y: clampNormalized(landmark.y),
      confidence,
      visibility: landmark.visibility
    };
  });

  return { joints, issues };
}

export async function detectPoseFromImage(image: HTMLImageElement): Promise<DetectionResult> {
  const startedAt = performance.now();

  try {
    const pose = await getMediaPipePose();

    const result = await new Promise<PoseResult>((resolve, reject) => {
      pose.onResults((poseResult) => {
        resolve(poseResult);
      });

      pose.send({ image }).catch(reject);
    });

    const firstPose = result.poseLandmarks;

    if (!firstPose) {
      return {
        status: "failed",
        joints: {},
        confidence: { averageJointConfidence: 0, minJointConfidence: 0, maxJointConfidence: 0, belowThresholdCount: 0 },
        coverage: { detectedJoints: 0, totalCanonicalJoints: CANONICAL_JOINT_NAMES.length },
        issues: [{ code: "no-pose-detected", severity: "error", message: "No pose was detected from the selected image." }],
        metadata: {
          detector: "mediapipe-pose",
          detectorVersion: "cdn-pose-js",
          model: "pose-js",
          imageWidth: image.naturalWidth,
          imageHeight: image.naturalHeight,
          elapsedMs: performance.now() - startedAt,
          generatedAtIso: new Date().toISOString()
        }
      };
    }

    const { joints, issues } = mapLandmarksToDetectionJoints(firstPose);
    const confidences = Object.values(joints).map((joint) => joint?.confidence ?? 0);
    const detectedJoints = Object.keys(joints).length;
    const belowThresholdCount = confidences.filter((confidence) => confidence < MIN_CONFIDENCE).length;

    if (detectedJoints < CANONICAL_JOINT_NAMES.length) {
      issues.push({
        code: "partial-pose",
        severity: "warning",
        message: `Partial pose detected (${detectedJoints}/${CANONICAL_JOINT_NAMES.length} canonical joints).`
      });
    }

    if (belowThresholdCount > 0) {
      issues.push({
        code: "low-confidence",
        severity: "warning",
        message: `${belowThresholdCount} mapped joints are below confidence threshold (${MIN_CONFIDENCE.toFixed(2)}).`
      });
    }

    const coverageRatio = detectedJoints / CANONICAL_JOINT_NAMES.length;

    return {
      status: coverageRatio >= MIN_COVERAGE_RATIO ? (detectedJoints === CANONICAL_JOINT_NAMES.length ? "success" : "partial") : "failed",
      joints,
      confidence: {
        averageJointConfidence: confidences.length === 0 ? 0 : confidences.reduce((sum, value) => sum + value, 0) / confidences.length,
        minJointConfidence: confidences.length === 0 ? 0 : Math.min(...confidences),
        maxJointConfidence: confidences.length === 0 ? 0 : Math.max(...confidences),
        belowThresholdCount
      },
      coverage: { detectedJoints, totalCanonicalJoints: CANONICAL_JOINT_NAMES.length },
      issues,
      metadata: {
        detector: "mediapipe-pose",
        detectorVersion: "cdn-pose-js",
        model: "pose-js",
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        elapsedMs: performance.now() - startedAt,
        generatedAtIso: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      status: "failed",
      joints: {},
      confidence: { averageJointConfidence: 0, minJointConfidence: 0, maxJointConfidence: 0, belowThresholdCount: 0 },
      coverage: { detectedJoints: 0, totalCanonicalJoints: CANONICAL_JOINT_NAMES.length },
      issues: [
        {
          code: "detector-load-failed",
          severity: "error",
          message: error instanceof Error ? error.message : "Pose detector failed to initialize."
        }
      ],
      metadata: {
        detector: "mediapipe-pose",
        detectorVersion: "cdn-pose-js",
        model: "pose-js",
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        elapsedMs: performance.now() - startedAt,
        generatedAtIso: new Date().toISOString()
      }
    };
  }
}
