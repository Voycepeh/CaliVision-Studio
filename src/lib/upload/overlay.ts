import { PREVIEW_OVERLAY_STYLE, getPreviewConnections, getPreviewJointNames, getPreviewJointRole } from "@/lib/pose/preview-overlay";
import type { CanonicalJointName } from "@/lib/schema/contracts";
import type { ReplayOverlayState } from "@/lib/analysis/replay-state";
import type { CoachingFeedbackOutput, CoachingVisualGuide } from "@/lib/analysis/coaching-feedback";
import { resolveCoachingArrowEndpoint } from "./coaching-overlay-geometry";
import { projectNormalizedPoint, type OverlayProjection } from "@/lib/live/overlay-geometry";
import { formatDurationStopwatch } from "@/lib/format/safe-duration";
import type { PoseFrame } from "@/lib/upload/types";
import { createCenterOfGravityTracker, type CenterOfGravityTracker } from "@/lib/workflow/center-of-gravity";

const CONNECTIONS = getPreviewConnections("front");
const VISIBLE_JOINTS = new Set(getPreviewJointNames("front"));
const UPLOAD_OVERLAY_STYLE = {
  skeletonBase: PREVIEW_OVERLAY_STYLE.skeletonBase,
  nose: PREVIEW_OVERLAY_STYLE.nose,
  hip: PREVIEW_OVERLAY_STYLE.hip,
  jointRadiusBase: PREVIEW_OVERLAY_STYLE.jointRadiusBase,
  jointRadiusLargeMultiplier: PREVIEW_OVERLAY_STYLE.jointRadiusLargeMultiplier,
  skeletonStrokeWidth: PREVIEW_OVERLAY_STYLE.skeletonStrokeWidth
} as const;

const CENTER_OF_GRAVITY_STYLE = {
  radius: 12,
  innerRadius: 5.2,
  spikes: 5,
  fillColor: "rgba(251, 191, 36, 0.9)",
  strokeColor: "rgba(15, 23, 42, 0.95)",
  ringColor: "rgba(255, 255, 255, 0.92)",
  strokeWidth: 2.6,
  ringWidth: 1.5
} as const;

const FALLBACK_COG_TRACKER = createCenterOfGravityTracker();

type CenterOfGravityDebugOptions = {
  enabled?: boolean;
  forceVisible?: boolean;
};

function resolveCenterOfGravityDebugOptions(debugOptions?: CenterOfGravityDebugOptions): Required<CenterOfGravityDebugOptions> {
  const isDev = process.env.NODE_ENV !== "production";
  const globalDebug = isDev && typeof window !== "undefined" ? (window as typeof window & { __CV_DEBUG_COG__?: CenterOfGravityDebugOptions }).__CV_DEBUG_COG__ : null;
  return {
    enabled: isDev && Boolean(debugOptions?.enabled ?? globalDebug?.enabled ?? false),
    forceVisible: isDev && Boolean(debugOptions?.forceVisible ?? globalDebug?.forceVisible ?? false)
  };
}

function drawCenterOfGravityStar(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  width: number,
  height: number,
  projection?: OverlayProjection
): { x: number; y: number } {
  const canvasPoint = toCanvasPoint(point, width, height, projection);
  const outerRadius = Math.max(8, (width / 1280) * CENTER_OF_GRAVITY_STYLE.radius);
  const innerRadius = Math.max(3.8, (width / 1280) * CENTER_OF_GRAVITY_STYLE.innerRadius);

  ctx.save();
  ctx.beginPath();
  for (let spike = 0; spike < CENTER_OF_GRAVITY_STYLE.spikes * 2; spike += 1) {
    const angle = (Math.PI / CENTER_OF_GRAVITY_STYLE.spikes) * spike - Math.PI / 2;
    const radius = spike % 2 === 0 ? outerRadius : innerRadius;
    const x = canvasPoint.x + Math.cos(angle) * radius;
    const y = canvasPoint.y + Math.sin(angle) * radius;
    if (spike === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fillStyle = CENTER_OF_GRAVITY_STYLE.fillColor;
  ctx.strokeStyle = CENTER_OF_GRAVITY_STYLE.strokeColor;
  ctx.lineWidth = Math.max(1.8, (width / 1280) * CENTER_OF_GRAVITY_STYLE.strokeWidth);
  ctx.shadowColor = "rgba(2, 6, 23, 0.35)";
  ctx.shadowBlur = Math.max(5, (width / 1280) * 12);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(canvasPoint.x, canvasPoint.y, Math.max(2.4, (width / 1280) * 4), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(2, 6, 23, 0.92)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(canvasPoint.x, canvasPoint.y, outerRadius + Math.max(1.2, width / 1280), 0, Math.PI * 2);
  ctx.strokeStyle = CENTER_OF_GRAVITY_STYLE.ringColor;
  ctx.lineWidth = Math.max(1, (width / 1280) * CENTER_OF_GRAVITY_STYLE.ringWidth);
  ctx.stroke();
  ctx.restore();

  return canvasPoint;
}

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
  options?: { projection?: OverlayProjection; centerOfGravityTracker?: CenterOfGravityTracker; debugCenterOfGravity?: CenterOfGravityDebugOptions }
): void {
  if (!frame) {
    return;
  }
  const cogDebug = resolveCenterOfGravityDebugOptions(options?.debugCenterOfGravity);
  const centerOfGravityTracker = options?.centerOfGravityTracker ?? FALLBACK_COG_TRACKER;
  const centerOfGravity = centerOfGravityTracker.resolve(frame, { forceVisible: cogDebug.forceVisible });

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
    if (!VISIBLE_JOINTS.has(jointName as CanonicalJointName)) {
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

  if (centerOfGravity.visible && centerOfGravity.point) {
    const starCanvasPoint = drawCenterOfGravityStar(ctx, centerOfGravity.point, width, height, options?.projection);
    if (cogDebug.enabled) {
      console.debug("[cog-overlay] draw", {
        visible: centerOfGravity.visible,
        reason: centerOfGravity.reason,
        coverageRatio: Number(centerOfGravity.coverageRatio.toFixed(3)),
        usedSegmentCount: centerOfGravity.usedSegmentCount,
        normalizedPoint: centerOfGravity.point,
        canvasPoint: {
          x: Number(starCanvasPoint.x.toFixed(1)),
          y: Number(starCanvasPoint.y.toFixed(1))
        }
      });
    }
  } else if (cogDebug.enabled) {
    console.debug("[cog-overlay] suppressed", {
      reason: centerOfGravity.reason,
      coverageRatio: Number(centerOfGravity.coverageRatio.toFixed(3)),
      usedSegmentCount: centerOfGravity.usedSegmentCount,
      hasFrame: Boolean(frame)
    });
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
  const lines = buildAnalysisOverlayLines(replayOverlayState, options);
  if (lines.length === 0) return;

  const sidePadding = Math.max(10, width * 0.025);
  const align: CanvasTextAlign = width < 900 ? "right" : "left";
  const anchorX = align === "left" ? sidePadding : width - sidePadding;
  const estimatedHeight = 20 + lines.length * 24;
  const overlayY = Math.max(sidePadding, height - estimatedHeight - sidePadding);
  drawOverlayBlock(ctx, anchorX, overlayY, lines, align);
  if (replayOverlayState?.statusLabel) {
    drawStatusPill(ctx, anchorX, Math.max(sidePadding, overlayY - 28), replayOverlayState.statusLabel, align);
  }
}

export function buildAnalysisOverlayLines(
  replayOverlayState?: ReplayOverlayState | null,
  options?: {
    modeLabel?: string;
    showDrillMetrics?: boolean;
    phaseLabels?: Record<string, string>;
    phaseCount?: number;
  }
): string[] {
  const lines: string[] = [];
  if (options?.modeLabel) {
    lines.push(options.modeLabel);
  }
  if (options?.showDrillMetrics !== false && replayOverlayState) {
    const phaseLabel = resolvePhaseLabel(replayOverlayState.phaseLabel, options?.phaseLabels);
    const phaseHudLabel = toHudPhaseLabel(phaseLabel, options?.phaseCount);
    lines.push(phaseHudLabel ?? "Phase: No phase detected");
    if (replayOverlayState.showHoldTimer && !replayOverlayState.showRepCount) {
      if (replayOverlayState.holdActive) {
        lines.push(`Hold: ${formatOverlayDuration(replayOverlayState.holdElapsedMs)}`);
      } else if (replayOverlayState.detectedHoldMs > 0) {
        lines.push(`Hold total: ${formatOverlayDuration(replayOverlayState.detectedHoldMs)}`);
        lines.push(`Best hold: ${formatOverlayDuration(replayOverlayState.bestHoldMs)}`);
      } else {
        lines.push("Hold: No holds detected");
      }
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
  return lines;
}

function resolveGuideAnchor(frame: PoseFrame | undefined, guide: CoachingVisualGuide, width: number, height: number, projection?: OverlayProjection): { x: number; y: number } | null {
  const preferredJoint = guide.fromJoint ?? guide.targetJoints?.[0];
  if (!frame || !preferredJoint) return null;
  const joint = frame.joints[preferredJoint];
  if (!joint) return null;
  return toCanvasPoint(joint, width, height, projection);
}

export function drawCoachingOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: PoseFrame | undefined,
  coachingOutput?: CoachingFeedbackOutput | null,
  options?: { projection?: OverlayProjection; includeSecondary?: boolean }
): void {
  if (!coachingOutput) return;
  const guides = options?.includeSecondary ? coachingOutput.visualGuides : (coachingOutput.primaryIssue?.visualGuides ?? coachingOutput.visualGuides);
  if (guides.length === 0) return;

  ctx.save();
  for (const guide of guides) {
    if (guide.type === "stack_line") {
      const base = resolveGuideAnchor(frame, guide, width, height, options?.projection) ?? { x: width / 2, y: height / 2 };
      ctx.strokeStyle = guide.severity === "warning" ? "rgba(248,113,113,0.85)" : "rgba(34,211,238,0.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(base.x, Math.max(6, height * 0.08));
      ctx.lineTo(base.x, height - Math.max(6, height * 0.08));
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (guide.type === "correction_arrow") {
      const from = resolveGuideAnchor(frame, guide, width, height, options?.projection);
      if (!from) continue;
      const to = guide.direction === "toward_line" && frame && options?.projection
        ? (() => {
            const lineJoints = (guide.targetJoints?.length ? guide.targetJoints : ["leftWrist", "rightWrist"] as const)
              .map((jointName) => frame.joints[jointName])
              .filter((joint): joint is { x: number; y: number; confidence?: number } => Boolean(joint));
            if (lineJoints.length === 0) {
              return resolveCoachingArrowEndpoint({ from, guide, frame, width });
            }
            const stackX = lineJoints.map((joint) => toCanvasPoint(joint, width, height, options.projection)).reduce((sum, point) => sum + point.x, 0) / lineJoints.length;
            return { x: stackX, y: from.y };
          })()
        : resolveCoachingArrowEndpoint({ from, guide, frame, width });
      ctx.strokeStyle = "rgba(251,146,60,0.92)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    } else if (guide.type === "highlight_region") {
      const at = resolveGuideAnchor(frame, guide, width, height, options?.projection) ?? { x: width / 2, y: height / 2 };
      ctx.fillStyle = "rgba(34,211,238,0.16)";
      ctx.beginPath();
      ctx.arc(at.x, at.y, Math.max(28, width * 0.04), 0, Math.PI * 2);
      ctx.fill();
    } else if (guide.type === "metric_badge" || guide.type === "support_indicator") {
      drawStatusPill(ctx, Math.max(20, width - 20), Math.max(16, height * 0.1), guide.label ?? "Coach", "right");
    }
  }
  ctx.restore();
}
