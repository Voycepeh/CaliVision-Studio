import { MEDIAPIPE_CANONICAL_LANDMARK_INDEX } from "@/lib/detection/mediapipe/landmarks";
import type { PoseFrame } from "@/lib/upload/types";

const TASKS_VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

type PoseLandmarkerResult = {
  landmarks?: Array<Array<{ x: number; y: number; visibility?: number }>>;
};

type PoseLandmarkerLike = {
  detectForVideo: (video: HTMLVideoElement, timestampMs: number) => PoseLandmarkerResult;
};

let poseLandmarkerPromise: Promise<PoseLandmarkerLike> | null = null;

async function createPoseLandmarker(): Promise<PoseLandmarkerLike> {
  const visionModule = await import(/* webpackIgnore: true */ `${TASKS_VISION_CDN}`);
  const fileset = await visionModule.FilesetResolver.forVisionTasks(`${TASKS_VISION_CDN}/wasm`);

  return visionModule.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.45,
    minPosePresenceConfidence: 0.45,
    minTrackingConfidence: 0.45
  }) as Promise<PoseLandmarkerLike>;
}

export async function getPoseLandmarker(): Promise<PoseLandmarkerLike> {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = createPoseLandmarker();
  }
  return poseLandmarkerPromise;
}

export function mapLandmarksToPoseFrame(landmarks: Array<{ x: number; y: number; visibility?: number }>, timestampMs: number): PoseFrame {
  const joints: PoseFrame["joints"] = {};

  for (const [jointName, index] of Object.entries(MEDIAPIPE_CANONICAL_LANDMARK_INDEX)) {
    const point = landmarks[index];
    if (!point) {
      continue;
    }

    joints[jointName as keyof PoseFrame["joints"]] = {
      x: Math.max(0, Math.min(1, point.x)),
      y: Math.max(0, Math.min(1, point.y)),
      confidence: point.visibility
    };
  }

  return {
    timestampMs,
    joints
  };
}
