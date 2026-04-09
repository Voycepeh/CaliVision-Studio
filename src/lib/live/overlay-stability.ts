import type { CanonicalJointName } from "@/lib/schema/contracts";
import type { PoseFrame } from "@/lib/upload/types";

type JointState = {
  x: number;
  y: number;
  visible: boolean;
  confidence?: number;
  missingFrames: number;
};

export type LiveOverlayStabilizerOptions = {
  smoothingAlpha: number;
  visibilityEnterThreshold: number;
  visibilityExitThreshold: number;
  maxMissingFrames: number;
};

const DEFAULT_OPTIONS: LiveOverlayStabilizerOptions = {
  smoothingAlpha: 0.35,
  visibilityEnterThreshold: 0.58,
  visibilityExitThreshold: 0.42,
  maxMissingFrames: 6
};

export function createLiveOverlayStabilizer(options?: Partial<LiveOverlayStabilizerOptions>) {
  const config: LiveOverlayStabilizerOptions = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  const state: Partial<Record<CanonicalJointName, JointState>> = {};

  return {
    reset() {
      for (const key of Object.keys(state) as CanonicalJointName[]) {
        delete state[key];
      }
    },
    stabilize(frame: PoseFrame): PoseFrame {
      const stabilizedJoints: PoseFrame["joints"] = {};
      const seen = new Set<CanonicalJointName>();

      for (const [rawJointName, point] of Object.entries(frame.joints)) {
        if (!point) continue;
        const jointName = rawJointName as CanonicalJointName;
        seen.add(jointName);

        const prev = state[jointName];
        const confidence = point.confidence;
        const hasConfidence = typeof confidence === "number" && Number.isFinite(confidence);
        const visibleByConfidence = hasConfidence
          ? prev?.visible
            ? confidence >= config.visibilityExitThreshold
            : confidence >= config.visibilityEnterThreshold
          : true;

        if (!visibleByConfidence) {
          state[jointName] = {
            x: prev?.x ?? point.x,
            y: prev?.y ?? point.y,
            visible: false,
            confidence,
            missingFrames: 0
          };
          continue;
        }

        const alpha = Math.max(0.05, Math.min(0.95, config.smoothingAlpha));
        const nextX = prev ? prev.x + (point.x - prev.x) * alpha : point.x;
        const nextY = prev ? prev.y + (point.y - prev.y) * alpha : point.y;

        state[jointName] = {
          x: nextX,
          y: nextY,
          visible: true,
          confidence,
          missingFrames: 0
        };

        stabilizedJoints[jointName] = {
          x: nextX,
          y: nextY,
          confidence
        };
      }

      for (const key of Object.keys(state) as CanonicalJointName[]) {
        if (seen.has(key)) continue;
        const prev = state[key];
        if (!prev) continue;
        const missingFrames = prev.missingFrames + 1;
        if (missingFrames > config.maxMissingFrames) {
          delete state[key];
          continue;
        }
        state[key] = {
          ...prev,
          missingFrames,
          visible: false
        };
      }

      return {
        timestampMs: frame.timestampMs,
        joints: stabilizedJoints
      };
    }
  };
}
