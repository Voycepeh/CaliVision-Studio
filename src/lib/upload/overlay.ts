import { PREVIEW_OVERLAY_STYLE, getPreviewConnections, getPreviewJointNames, getPreviewJointRole } from "@/lib/pose/preview-overlay";
import type { CanonicalJointName } from "@/lib/schema/contracts";
import type { PoseFrame } from "@/lib/upload/types";

const CONNECTIONS = getPreviewConnections("front");
const VISIBLE_JOINTS = new Set(getPreviewJointNames("front"));
const UPLOAD_OVERLAY_STYLE = {
  skeletonBase: PREVIEW_OVERLAY_STYLE.skeletonBase,
  nose: PREVIEW_OVERLAY_STYLE.nose,
  hip: PREVIEW_OVERLAY_STYLE.hip,
  jointRadiusBase: PREVIEW_OVERLAY_STYLE.jointRadiusBase * 0.5,
  jointRadiusLargeMultiplier: PREVIEW_OVERLAY_STYLE.jointRadiusLargeMultiplier,
  skeletonStrokeWidth: PREVIEW_OVERLAY_STYLE.skeletonStrokeWidth * 0.5
} as const;

function toCanvasPoint(joint: { x: number; y: number }, width: number, height: number) {
  return { x: joint.x * width, y: joint.y * height };
}

export function drawPoseOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame?: PoseFrame
): void {
  if (!frame) {
    return;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, (width / 1280) * UPLOAD_OVERLAY_STYLE.skeletonStrokeWidth);
  ctx.strokeStyle = UPLOAD_OVERLAY_STYLE.skeletonBase;

  for (const connection of CONNECTIONS) {
    const from = frame.joints[connection.from as CanonicalJointName];
    const to = frame.joints[connection.to as CanonicalJointName];
    if (!from || !to) {
      continue;
    }

    const fromPoint = toCanvasPoint(from, width, height);
    const toPoint = toCanvasPoint(to, width, height);
    ctx.beginPath();
    ctx.moveTo(fromPoint.x, fromPoint.y);
    ctx.lineTo(toPoint.x, toPoint.y);
    ctx.stroke();
  }

  for (const [jointName, point] of Object.entries(frame.joints)) {
    if (!point) {
      continue;
    }
    if (!VISIBLE_JOINTS.has(jointName as CanonicalJointName)) {
      continue;
    }
    const role = getPreviewJointRole(jointName as CanonicalJointName);
    ctx.fillStyle = role === "nose" ? UPLOAD_OVERLAY_STYLE.nose : role === "hip" ? UPLOAD_OVERLAY_STYLE.hip : UPLOAD_OVERLAY_STYLE.skeletonBase;
    const { x, y } = toCanvasPoint(point, width, height);
    ctx.beginPath();
    const baseRadius = Math.max(1, (width / 1280) * UPLOAD_OVERLAY_STYLE.jointRadiusBase);
    const radius = role === "nose" ? baseRadius * UPLOAD_OVERLAY_STYLE.jointRadiusLargeMultiplier : baseRadius;
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function getNearestPoseFrame(frames: PoseFrame[], currentMs: number): PoseFrame | undefined {
  if (frames.length === 0) {
    return undefined;
  }

  let low = 0;
  let high = frames.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = frames[mid];
    if (Math.abs(current.timestampMs - currentMs) <= 16) {
      return current;
    }

    if (current.timestampMs < currentMs) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return frames[Math.max(0, Math.min(frames.length - 1, low))];
}
