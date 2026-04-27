"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveDrillThumbnail } from "@/lib/drills/thumbnail";
import { normalizePoseToLandscapePreview } from "@/lib/drills/preview-normalization";
import { getPreviewConnections, getPreviewJointNames, getPreviewJointRole, PREVIEW_OVERLAY_STYLE } from "@/lib/pose/preview-overlay";
import type { PortableAssetRef, PortableDrill, PortablePose } from "@/lib/schema/contracts";

type MotionMode = "none" | "badge";
type DrillPreviewVariant = "exchangeCard" | "exchangeHero" | "selectedDrill" | "myDrillsCard" | "studio" | "compact" | "feature";

type Props = {
  drill: PortableDrill;
  assets?: PortableAssetRef[];
  variant?: DrillPreviewVariant;
  showMotionPreview?: boolean;
  motionMode?: MotionMode;
  showMotionBadge?: boolean;
  animate?: boolean;
  poseOverride?: PortablePose | null;
  width?: number | string;
  ariaLabel?: string;
  phaseLabel?: string | null;
};

function resolveVariant(variant: DrillPreviewVariant) {
  if (variant === "feature") return "exchangeHero";
  if (variant === "compact") return "exchangeCard";
  return variant;
}

function resolveSizingStyle(variant: ReturnType<typeof resolveVariant>): { maxWidth?: number | string } {
  if (variant === "exchangeHero") return { maxWidth: "100%" };
  if (variant === "selectedDrill") return { maxWidth: 260 };
  if (variant === "myDrillsCard") return { maxWidth: 220 };
  if (variant === "studio") return { maxWidth: 320 };
  return { maxWidth: "100%" };
}

function resolveOverlayScale(variant: ReturnType<typeof resolveVariant>): number {
  if (variant === "exchangeHero" || variant === "studio") return 1.15;
  if (variant === "selectedDrill") return 1.05;
  return 1;
}

export function DrillVisualPreview({
  drill,
  assets = [],
  variant = "exchangeHero",
  showMotionPreview = false,
  motionMode = "badge",
  showMotionBadge,
  animate = true,
  poseOverride = null,
  width = "100%",
  ariaLabel,
  phaseLabel
}: Props) {
  const resolvedVariant = resolveVariant(variant);
  const resolved = useMemo(() => resolveDrillThumbnail(drill, assets), [assets, drill]);
  const [imgError, setImgError] = useState(false);
  const fallback = useMemo(() => resolveDrillThumbnail(drill, []), [drill]);
  const src = imgError ? fallback.src : resolved.src;
  const motionFrames = useMemo(() => resolveMotionFrames(drill), [drill]);
  const canShowMotion = showMotionPreview && motionMode !== "none" && (Boolean(poseOverride) || motionFrames.length > 0);
  const shouldAnimateInternally = canShowMotion && animate && !poseOverride && drill.drillType !== "hold";
  const shouldShowMotionBadge = showMotionBadge ?? canShowMotion;
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!shouldAnimateInternally) {
      setElapsedMs(0);
      return;
    }
    let frameId = 0;
    let previousTs = 0;
    const tick = (timestamp: number) => {
      if (!previousTs) previousTs = timestamp;
      const delta = timestamp - previousTs;
      previousTs = timestamp;
      setElapsedMs((current) => current + delta);
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [shouldAnimateInternally]);

  const currentPose = useMemo(() => {
    if (poseOverride) {
      return poseOverride;
    }
    if (!motionFrames.length) return null;
    if (drill.drillType === "hold") return motionFrames[0]?.pose ?? null;
    const totalDuration = motionFrames.reduce((sum, frame) => sum + frame.durationMs, 0);
    if (totalDuration <= 0) return motionFrames[0]?.pose ?? null;
    const cursor = elapsedMs % totalDuration;
    let acc = 0;
    for (const frame of motionFrames) {
      acc += frame.durationMs;
      if (cursor <= acc) return frame.pose;
    }
    return motionFrames[motionFrames.length - 1]?.pose ?? null;
  }, [drill.drillType, elapsedMs, motionFrames, poseOverride]);

  const sizingStyle = resolveSizingStyle(resolvedVariant);
  const overlayScale = resolveOverlayScale(resolvedVariant);

  return (
    <div
      style={{
        borderRadius: "0.75rem",
        overflow: "hidden",
        border: "1px solid rgba(148, 163, 184, 0.25)",
        background: "#0f172a",
        width,
        ...sizingStyle
      }}
      aria-label={ariaLabel ?? `${drill.title || "Drill"} motion preview`}
    >
      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9" }}>
        <img
          src={src}
          alt={`${drill.title || "Drill"} thumbnail`}
          style={{ width: "100%", height: "100%", display: "block", objectFit: "contain", background: "linear-gradient(180deg, rgba(2, 6, 23, 0.85) 0%, rgba(2, 6, 23, 0.65) 100%)" }}
          onError={() => setImgError(true)}
        />

        {canShowMotion && currentPose ? (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <PoseOverlay pose={normalizePoseToLandscapePreview(currentPose)} view={drill.primaryView} scale={overlayScale} />
          </div>
        ) : null}

        <div style={{ position: "absolute", left: "0.45rem", top: "0.45rem", display: "flex", gap: "0.3rem", alignItems: "center" }}>
          {shouldShowMotionBadge ? (
            <span className="pill" style={{ fontSize: "0.68rem", background: "rgba(15, 23, 42, 0.78)", border: "1px solid rgba(114, 168, 255, 0.5)" }}>Motion</span>
          ) : null}
          {phaseLabel ? <span className="pill" style={{ fontSize: "0.68rem", background: "rgba(15, 23, 42, 0.72)" }}>{phaseLabel}</span> : null}
        </div>

        {showMotionPreview && !motionFrames.length ? (
          <span className="pill" style={{ position: "absolute", right: "0.4rem", bottom: "0.4rem", background: "rgba(15, 23, 42, 0.78)", border: "1px solid rgba(148, 163, 184, 0.45)", fontSize: "0.68rem", padding: "0.16rem 0.4rem" }}>
            No motion preview
          </span>
        ) : null}
      </div>
    </div>
  );
}

function resolveMotionFrames(drill: PortableDrill): Array<{ pose: PortablePose; durationMs: number }> {
  const authored = [...drill.phases]
    .sort((a, b) => a.order - b.order)
    .flatMap((phase) => {
      const pose = phase.poseSequence[0];
      return pose ? [{ pose, durationMs: Math.max(phase.durationMs, 450) }] : [];
    });
  if (authored.length > 0) return authored;

  return [...(drill.benchmark?.phaseSequence ?? [])]
    .sort((a, b) => a.order - b.order)
    .flatMap((phase) => {
      if (!phase.pose) return [];
      const benchmarkDuration = phase.targetDurationMs ?? drill.benchmark?.timing?.phaseDurationsMs?.[phase.key] ?? 700;
      return [{ pose: phase.pose, durationMs: Math.max(benchmarkDuration, 450) }];
    });
}

function PoseOverlay({ pose, view, scale }: { pose: PortablePose; view: PortableDrill["primaryView"]; scale: number }) {
  const connections = getPreviewConnections(view);
  const allowedJointNames = new Set(getPreviewJointNames(view));
  const entries = Object.entries(pose.joints)
    .flatMap(([name, point]) => point ? [{ name, point }] : [])
    .filter((entry) => allowedJointNames.has(entry.name as keyof PortablePose["joints"] & string)) as Array<{ name: keyof PortablePose["joints"] & string; point: NonNullable<PortablePose["joints"][keyof PortablePose["joints"]]> }>;
  const byJoint = new Map(entries.map((entry) => [entry.name, entry.point]));
  const connectedJointNames = new Set<string>();
  return (
    <svg viewBox={`0 0 ${pose.canvas.widthRef} ${pose.canvas.heightRef}`} style={{ width: "100%", height: "100%", display: "block" }} aria-hidden>
      {connections.map((segment) => {
        const from = byJoint.get(segment.from);
        const to = byJoint.get(segment.to);
        if (!from || !to) return null;
        connectedJointNames.add(segment.from);
        connectedJointNames.add(segment.to);
        return (
          <line
            key={`${segment.from}-${segment.to}`}
            x1={from.x * pose.canvas.widthRef}
            y1={from.y * pose.canvas.heightRef}
            x2={to.x * pose.canvas.widthRef}
            y2={to.y * pose.canvas.heightRef}
            stroke={PREVIEW_OVERLAY_STYLE.skeletonBase}
            strokeWidth={Math.max(1.75, PREVIEW_OVERLAY_STYLE.skeletonStrokeWidth * 0.3 * scale)}
            strokeLinecap="round"
            opacity={0.95}
          />
        );
      })}
      {entries.filter((joint) => connectedJointNames.has(joint.name)).map((joint) => {
        const role = getPreviewJointRole(joint.name as never);
        return (
          <circle
            key={joint.name}
            cx={joint.point.x * pose.canvas.widthRef}
            cy={joint.point.y * pose.canvas.heightRef}
            r={Math.max(2.1, (role === "nose" || role === "hip" ? 2.8 : 2.2) * scale)}
            fill={role === "nose" ? PREVIEW_OVERLAY_STYLE.nose : role === "hip" ? PREVIEW_OVERLAY_STYLE.hip : PREVIEW_OVERLAY_STYLE.skeletonBase}
            opacity={0.95}
          />
        );
      })}
    </svg>
  );
}
