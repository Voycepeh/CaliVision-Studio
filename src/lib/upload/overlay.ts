import { PREVIEW_OVERLAY_STYLE, getPreviewConnections, getPreviewJointNames, getPreviewJointRole } from "@/lib/pose/preview-overlay";
import type { CanonicalJointName } from "@/lib/schema/contracts";
import type { ResolvedDrillCameraView } from "@/lib/drill-camera-view";
import type { ReplayOverlayState } from "@/lib/analysis/replay-state";
import { projectNormalizedPoint, type OverlayProjection } from "@/lib/live/overlay-geometry";
import { formatDurationStopwatch } from "@/lib/format/safe-duration";
import type { PoseFrame } from "@/lib/upload/types";

const UPLOAD_OVERLAY_STYLE = {
  skeletonBase: PREVIEW_OVERLAY_STYLE.skeletonBase,
  nose: PREVIEW_OVERLAY_STYLE.nose,
  hip: PREVIEW_OVERLAY_STYLE.hip,
  jointRadiusBase: PREVIEW_OVERLAY_STYLE.jointRadiusBase,
  jointRadiusLargeMultiplier: PREVIEW_OVERLAY_STYLE.jointRadiusLargeMultiplier,
  skeletonStrokeWidth: PREVIEW_OVERLAY_STYLE.skeletonStrokeWidth
} as const;

function toCanvasPoint(joint: { x: number; y: number }, width: number, height: number, projection?: OverlayProjection) {
  if (projection) {
    return projectNormalizedPoint(joint, projection);
  }
  return { x: joint.x * width, y: joint.y * height };
}

export function drawPoseOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame?: PoseFrame,
  options?: { projection?: OverlayProjection; cameraView?: ResolvedDrillCameraView }
): void {
  if (!frame) {
    return;
  }

  const cameraView = options?.cameraView ?? "front";
  const visibleJoints = new Set(getPreviewJointNames(cameraView));
  const connections = getPreviewConnections(cameraView);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, (width / 1280) * UPLOAD_OVERLAY_STYLE.skeletonStrokeWidth);
  ctx.strokeStyle = UPLOAD_OVERLAY_STYLE.skeletonBase;

  for (const connection of connections) {
    const from = frame.joints[connection.from as CanonicalJointName];
    const to = frame.joints[connection.to as CanonicalJointName];
    if (!from || !to) {
      continue;
    }

    const fromPoint = toCanvasPoint(from, width, height, options?.projection);
    const toPoint = toCanvasPoint(to, width, height, options?.projection);
    ctx.beginPath();
    ctx.moveTo(fromPoint.x, fromPoint.y);
    ctx.lineTo(toPoint.x, toPoint.y);
    ctx.stroke();
  }

  for (const [jointName, point] of Object.entries(frame.joints)) {
    if (!point) {
      continue;
    }
    if (!visibleJoints.has(jointName as CanonicalJointName)) {
      continue;
    }
    const role = getPreviewJointRole(jointName as CanonicalJointName);
    ctx.fillStyle = role === "nose" ? UPLOAD_OVERLAY_STYLE.nose : role === "hip" ? UPLOAD_OVERLAY_STYLE.hip : UPLOAD_OVERLAY_STYLE.skeletonBase;
    const { x, y } = toCanvasPoint(point, width, height, options?.projection);
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
  return formatDurationStopwatch(durationMs);
}

function resolvePhaseLabel(phaseId: string | null, phaseLabels?: Record<string, string>): string | null {
  if (!phaseId) return null;
  const display = phaseLabels?.[phaseId]?.trim();
  return display || phaseId;
}



function toHudPhaseLabel(phaseLabel: string | null, phaseCount?: number): string | null {
  if (!phaseLabel) {
    return null;
  }
  const match = phaseLabel.match(/^(\d+)\.\s+(.+)$/);
  if (!match) {
    return phaseLabel;
  }
  const [, sequence, name] = match;
  if (!phaseCount || phaseCount < 1) {
    return `Phase ${sequence} · ${name}`;
  }
  return `Phase ${sequence}/${phaseCount} · ${name}`;
}
function drawOverlayBlock(ctx: CanvasRenderingContext2D, x: number, y: number, lines: string[], align: CanvasTextAlign): number {
  if (lines.length === 0) {
    return 0;
  }

  const titleFontSize = 16;
  const bodyFontSize = 14;
  const lineGap = 6;
  const paddingX = 12;
  const paddingY = 10;

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  const widest = lines.reduce((max, line, index) => {
    ctx.font = index === 0
      ? `600 ${titleFontSize}px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`
      : `500 ${bodyFontSize}px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    return Math.max(max, ctx.measureText(line).width);
  }, 0);
  const lineHeights = lines.map((_, index) => (index === 0 ? titleFontSize + 2 : bodyFontSize + 2));
  const contentHeight = lineHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, lines.length - 1) * lineGap;
  const boxWidth = widest + paddingX * 2;
  const boxHeight = contentHeight + paddingY * 2;
  const left = align === "left" ? x : x - boxWidth;

  ctx.fillStyle = "rgba(100, 116, 139, 0.54)";
  ctx.strokeStyle = "rgba(226, 232, 240, 0.52)";
  ctx.lineWidth = 1;
  ctx.shadowColor = "rgba(2, 6, 23, 0.2)";
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.roundRect(left, y, boxWidth, boxHeight, 12);
  ctx.fill();
  ctx.stroke();

  let textY = y + paddingY;
  lines.forEach((line, index) => {
    ctx.font = index === 0
      ? `600 ${titleFontSize}px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`
      : `500 ${bodyFontSize}px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.fillStyle = index === 0 ? "rgba(248, 250, 252, 0.97)" : "rgba(241, 245, 249, 0.94)";
    const textX = align === "left" ? left + paddingX : left + boxWidth - paddingX;
    ctx.fillText(line, textX, textY);
    textY += lineHeights[index] + (index === lines.length - 1 ? 0 : lineGap);
  });
  ctx.restore();
  return boxHeight;
}

function drawStatusPill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, align: CanvasTextAlign): void {
  ctx.save();
  ctx.font = "600 12px Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  const paddingX = 8;
  const paddingY = 5;
  const boxWidth = ctx.measureText(text).width + paddingX * 2;
  const boxHeight = 12 + paddingY * 2;
  const left = align === "left" ? x : x - boxWidth;
  ctx.fillStyle = "rgba(148, 163, 184, 0.24)";
  ctx.strokeStyle = "rgba(226, 232, 240, 0.52)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(left, y, boxWidth, boxHeight, 999);
  ctx.fill();
  ctx.stroke();
  const textX = align === "left" ? left + paddingX : left + boxWidth - paddingX;
  ctx.fillStyle = "rgba(241, 245, 249, 0.92)";
  ctx.fillText(text, textX, y + paddingY);
  ctx.restore();
}

export function drawAnalysisOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  replayOverlayState?: ReplayOverlayState | null,
  options?: {
    modeLabel?: string;
    showDrillMetrics?: boolean;
    phaseLabels?: Record<string, string>;
    phaseCount?: number;
  }
): void {
  const sidePadding = Math.max(10, width * 0.025);
  const lines: string[] = [];
  if (options?.modeLabel) {
    lines.push(options.modeLabel);
  }
  if (options?.showDrillMetrics !== false && replayOverlayState) {
    const phaseLabel = resolvePhaseLabel(replayOverlayState.phaseLabel, options?.phaseLabels);
    const phaseHudLabel = toHudPhaseLabel(phaseLabel, options?.phaseCount);
    lines.push(phaseHudLabel ?? "Phase: No phase detected");
    if (replayOverlayState.showHoldTimer && !replayOverlayState.showRepCount) {
      lines.push(`Hold: ${replayOverlayState.holdActive ? formatOverlayDuration(replayOverlayState.holdElapsedMs) : "No holds detected"}`);
    } else if (replayOverlayState.showRepCount && !replayOverlayState.showHoldTimer) {
      lines.push(replayOverlayState.repCount > 0 ? `Reps: ${replayOverlayState.repCount}` : "Reps: No reps detected");
    } else if (replayOverlayState.showRepCount && replayOverlayState.showHoldTimer) {
      lines.push(
        replayOverlayState.holdActive
          ? `Reps: ${replayOverlayState.repCount} · Hold: ${formatOverlayDuration(replayOverlayState.holdElapsedMs)}`
          : replayOverlayState.repCount > 0
            ? `Reps: ${replayOverlayState.repCount} · Hold: No holds detected`
            : "Reps: No reps detected · Hold: No holds detected"
      );
    }
  }
  if (lines.length === 0) return;

  const align: CanvasTextAlign = width < 900 ? "right" : "left";
  const anchorX = align === "left" ? sidePadding : width - sidePadding;
  const estimatedHeight = 20 + lines.length * 24;
  const overlayY = Math.max(sidePadding, height - estimatedHeight - sidePadding);
  drawOverlayBlock(ctx, anchorX, overlayY, lines, align);
  if (replayOverlayState?.statusLabel) {
    drawStatusPill(ctx, anchorX, Math.max(sidePadding, overlayY - 28), replayOverlayState.statusLabel, align);
  }
}
