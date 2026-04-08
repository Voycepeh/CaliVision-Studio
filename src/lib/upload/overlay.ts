import { PREVIEW_OVERLAY_STYLE, getPreviewConnections, getPreviewJointNames, getPreviewJointRole } from "@/lib/pose/preview-overlay";
import type { CanonicalJointName } from "@/lib/schema/contracts";
import type { ReplayOverlayState } from "@/lib/analysis/replay-state";
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

function formatOverlayDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function drawOverlayBlock(ctx: CanvasRenderingContext2D, x: number, y: number, lines: string[], align: CanvasTextAlign): void {
  if (lines.length === 0) {
    return;
  }

  const fontSize = 18;
  const lineHeight = 24;
  ctx.save();
  ctx.font = `600 ${fontSize}px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  const widest = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
  const paddingX = 12;
  const paddingY = 10;
  const boxWidth = widest + paddingX * 2;
  const boxHeight = lines.length * lineHeight + paddingY * 2;
  const left = align === "left" ? x : x - boxWidth;
  ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.66)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(left, y, boxWidth, boxHeight, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(248, 250, 252, 0.95)";
  lines.forEach((line, index) => {
    const textX = align === "left" ? left + paddingX : left + boxWidth - paddingX;
    ctx.fillText(line, textX, y + paddingY + index * lineHeight);
  });
  ctx.restore();
}

function drawStatusPill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
  ctx.save();
  ctx.font = "600 14px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const paddingX = 10;
  const paddingY = 7;
  const boxWidth = ctx.measureText(text).width + paddingX * 2;
  const boxHeight = 14 + paddingY * 2;
  ctx.fillStyle = "rgba(148, 163, 184, 0.2)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, boxWidth, boxHeight, 999);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(241, 245, 249, 0.95)";
  ctx.fillText(text, x + paddingX, y + paddingY);
  ctx.restore();
}

export function drawAnalysisOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  _height: number,
  replayOverlayState?: ReplayOverlayState | null
): void {
  if (!replayOverlayState) {
    return;
  }

  const topPadding = Math.max(10, width * 0.01);
  const sidePadding = Math.max(10, width * 0.015);
  const leftLines: string[] = [];
  const rightLines: string[] = [];

  leftLines.push(replayOverlayState.phaseLabel ? `Phase: ${replayOverlayState.phaseLabel}` : "Phase: none");

  if (replayOverlayState.showRepCount) {
    rightLines.push(`Reps: ${replayOverlayState.repCount}`);
  }

  if (replayOverlayState.showHoldTimer) {
    rightLines.push(`Hold: ${formatOverlayDuration(replayOverlayState.holdElapsedMs)}`);
  }

  drawOverlayBlock(ctx, sidePadding, topPadding, leftLines, "left");
  drawOverlayBlock(ctx, width - sidePadding, topPadding, rightLines, "right");
  if (replayOverlayState.statusLabel) {
    drawStatusPill(ctx, sidePadding, topPadding + 52, replayOverlayState.statusLabel);
  }
}
