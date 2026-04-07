import { getPreviewConnections } from "@/lib/pose/preview-overlay";
import type { CanonicalJointName } from "@/lib/schema/contracts";
import type { PoseFrame } from "@/lib/upload/types";

const CONNECTIONS = getPreviewConnections("front");

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
  ctx.lineWidth = Math.max(2, width * 0.004);
  ctx.strokeStyle = "rgba(114, 168, 255, 0.92)";

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

  ctx.fillStyle = "rgba(124, 240, 169, 0.95)";
  for (const point of Object.values(frame.joints)) {
    if (!point) {
      continue;
    }
    const { x, y } = toCanvasPoint(point, width, height);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, width * 0.006), 0, Math.PI * 2);
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
