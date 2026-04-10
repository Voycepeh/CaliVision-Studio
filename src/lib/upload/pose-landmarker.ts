import { MEDIAPIPE_CANONICAL_LANDMARK_INDEX } from "@/lib/detection/mediapipe/landmarks";
import type { PoseFrame } from "@/lib/upload/types";

const TASKS_VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

type PoseLandmarkerResult = {
  landmarks?: Array<Array<{ x: number; y: number; visibility?: number }>>;
};

type PoseLandmarkerLike = {
  detectForVideo: (video: HTMLVideoElement, timestampMs: number) => PoseLandmarkerResult;
  close?: () => void;
};

type VisionRuntime = {
  visionModule: {
    PoseLandmarker: {
      createFromOptions: (fileset: unknown, options: unknown) => Promise<PoseLandmarkerLike>;
    };
    FilesetResolver: {
      forVisionTasks: (wasmPath: string) => Promise<unknown>;
    };
  };
  fileset: unknown;
};

let visionRuntimePromise: Promise<VisionRuntime> | null = null;

async function getVisionRuntime(): Promise<VisionRuntime> {
  if (!visionRuntimePromise) {
    visionRuntimePromise = (async () => {
      const visionTasks = await import(/* webpackIgnore: true */ `${TASKS_VISION_CDN}`);
      const fileset = await visionTasks.FilesetResolver.forVisionTasks(`${TASKS_VISION_CDN}/wasm`);
      return { visionModule: visionTasks, fileset };
    })();
  }

  return visionRuntimePromise;
}

async function createPoseLandmarker(): Promise<PoseLandmarkerLike> {
  const runtime = await getVisionRuntime();

  const baseOptions = {
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.45,
    minPosePresenceConfidence: 0.45,
    minTrackingConfidence: 0.45
  } as const;

  try {
    return (await runtime.visionModule.PoseLandmarker.createFromOptions(runtime.fileset, {
      ...baseOptions,
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU"
      }
    })) as PoseLandmarkerLike;
  } catch {
    return (await runtime.visionModule.PoseLandmarker.createFromOptions(runtime.fileset, {
      ...baseOptions,
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "CPU"
      }
    })) as PoseLandmarkerLike;
  }
}

export async function createPoseLandmarkerForJob(): Promise<PoseLandmarkerLike> {
  return createPoseLandmarker();
}

export function mapLandmarksToPoseFrame(
  landmarks: Array<{ x: number; y: number; visibility?: number }>,
  timestampMs: number,
  options?: { frameWidth?: number; frameHeight?: number; mirrored?: boolean }
): PoseFrame {
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
    frameWidth: options?.frameWidth,
    frameHeight: options?.frameHeight,
    mirrored: options?.mirrored,
    joints
  };
}
