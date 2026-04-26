"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveDrillThumbnail } from "@/lib/drills/thumbnail";
import { getPreviewConnections, getPreviewJointRole, PREVIEW_OVERLAY_STYLE } from "@/lib/pose/preview-overlay";
import type { PortableAssetRef, PortableDrill, PortablePose } from "@/lib/schema/contracts";

type MotionMode = "none" | "badge" | "inset" | "inline";

type Props = {
  drill: PortableDrill;
  assets?: PortableAssetRef[];
  variant?: "compact" | "feature";
  showMotionPreview?: boolean;
  motionMode?: MotionMode;
  width?: number | string;
  height?: number;
  ariaLabel?: string;
};

function hasPhasePoseData(drill: PortableDrill): boolean {
  return resolveMotionFrames(drill).length > 0;
}

function resolveMotionMode(variant: "compact" | "feature", requestedMode: MotionMode): MotionMode {
  if (requestedMode !== "inline") {
    return requestedMode;
  }
  return variant === "feature" ? "inset" : "badge";
}

export function DrillVisualPreview({
  drill,
  assets = [],
  variant = "feature",
  showMotionPreview = false,
  motionMode = "inline",
  width = "100%",
  height,
  ariaLabel
}: Props) {
  const resolved = useMemo(() => resolveDrillThumbnail(drill, assets), [assets, drill]);
  const [imgError, setImgError] = useState(false);
  const fallback = useMemo(() => resolveDrillThumbnail(drill, []), [drill]);
  const src = imgError ? fallback.src : resolved.src;
  const isCompact = variant === "compact";
  const resolvedMode = resolveMotionMode(variant, motionMode);
  const motionFrames = useMemo(() => resolveMotionFrames(drill), [drill]);
  const canShowMotion = showMotionPreview && hasPhasePoseData(drill) && resolvedMode !== "none";
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!canShowMotion || drill.drillType === "hold") {
      setElapsedMs(0);
      return;
    }
    let frameId = 0;
    let previousTs = 0;
    const tick = (timestamp: number) => {
      if (!previousTs) {
        previousTs = timestamp;
      }
      const delta = timestamp - previousTs;
      previousTs = timestamp;
      setElapsedMs((current) => current + delta);
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [canShowMotion, drill.drillType]);
  const currentPose = useMemo(() => {
    if (!motionFrames.length) {
      return null;
    }
    if (drill.drillType === "hold") {
      return motionFrames[0]?.pose ?? null;
    }
    const totalDuration = motionFrames.reduce((sum, frame) => sum + frame.durationMs, 0);
    if (totalDuration <= 0) {
      return motionFrames[0]?.pose ?? null;
    }
    const cursor = elapsedMs % totalDuration;
    let acc = 0;
    for (const frame of motionFrames) {
      acc += frame.durationMs;
      if (cursor <= acc) {
        return frame.pose;
      }
    }
    return motionFrames[motionFrames.length - 1]?.pose ?? null;
  }, [drill.drillType, elapsedMs, motionFrames]);

  return (
    <div
      style={{
        borderRadius: isCompact ? "0.65rem" : "0.75rem",
        overflow: "hidden",
        border: "1px solid rgba(148, 163, 184, 0.25)",
        background: "#0f172a",
        width,
        maxWidth: "100%"
      }}
      aria-label={ariaLabel ?? `${drill.title || "Drill"} visual preview`}
    >
      <div style={{ position: "relative", width: "100%", aspectRatio: height ? undefined : "16 / 9", height }}>
        <img
          src={src}
          alt={`${drill.title || "Drill"} thumbnail`}
          style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }}
          onError={() => setImgError(true)}
        />
        {canShowMotion && currentPose ? (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(2, 6, 23, 0.05) 0%, rgba(2, 6, 23, 0.22) 100%)" }}>
            <PoseOverlay pose={currentPose} view={drill.primaryView} />
          </div>
        ) : null}
        {showMotionPreview && !motionFrames.length ? (
          <span
            className="pill"
            style={{
              position: "absolute",
              right: "0.4rem",
              bottom: "0.4rem",
              background: "rgba(15, 23, 42, 0.78)",
              border: "1px solid rgba(148, 163, 184, 0.45)",
              fontSize: "0.68rem",
              padding: "0.16rem 0.4rem"
            }}
          >
            No motion preview yet
          </span>
        ) : null}
        {canShowMotion && resolvedMode === "badge" ? (
          <span
            className="pill"
            style={{
              position: "absolute",
              right: "0.4rem",
              bottom: "0.4rem",
              background: "rgba(15, 23, 42, 0.78)",
              border: "1px solid rgba(114, 168, 255, 0.5)",
              fontSize: "0.68rem",
              padding: "0.16rem 0.4rem"
            }}
          >
            Motion
          </span>
        ) : null}
        {canShowMotion && resolvedMode === "inset" ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              right: "0.5rem",
              bottom: "0.5rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(114, 168, 255, 0.4)",
              background: "rgba(15, 23, 42, 0.82)",
              padding: "0.3rem 0.45rem",
              display: "grid",
              gap: "0.12rem",
              minWidth: isCompact ? "72px" : "88px"
            }}
          >
            <span style={{ fontSize: "0.64rem", color: "#bfdbfe", lineHeight: 1 }}>Motion</span>
            <span className="muted" style={{ fontSize: "0.62rem", lineHeight: 1 }}>Pose phases</span>
          </div>
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
  if (authored.length > 0) {
    return authored;
  }
  const benchmark = [...(drill.benchmark?.phaseSequence ?? [])]
    .sort((a, b) => a.order - b.order)
    .flatMap((phase) => {
      if (!phase.pose) {
        return [];
      }
      const benchmarkDuration = phase.targetDurationMs
        ?? drill.benchmark?.timing?.phaseDurationsMs?.[phase.key]
        ?? 700;
      return [{ pose: phase.pose, durationMs: Math.max(benchmarkDuration, 450) }];
    });
  return benchmark;
}

function PoseOverlay({ pose, view }: { pose: PortablePose; view: PortableDrill["primaryView"] }) {
  const connections = getPreviewConnections(view);
  const entries = Object.entries(pose.joints).flatMap(([name, point]) =>
    point ? [{ name, point }] : []
  ) as Array<{ name: keyof PortablePose["joints"] & string; point: NonNullable<PortablePose["joints"][keyof PortablePose["joints"]]> }>;
  const byJoint = new Map(entries.map((entry) => [entry.name, entry.point]));
  return (
    <svg viewBox={`0 0 ${pose.canvas.widthRef} ${pose.canvas.heightRef}`} style={{ width: "100%", height: "100%", display: "block" }} aria-hidden>
      {connections.map((segment) => {
        const from = byJoint.get(segment.from);
        const to = byJoint.get(segment.to);
        if (!from || !to) {
          return null;
        }
        return (
          <line
            key={`${segment.from}-${segment.to}`}
            x1={from.x * pose.canvas.widthRef}
            y1={from.y * pose.canvas.heightRef}
            x2={to.x * pose.canvas.widthRef}
            y2={to.y * pose.canvas.heightRef}
            stroke={PREVIEW_OVERLAY_STYLE.skeletonBase}
            strokeWidth={Math.max(1.5, PREVIEW_OVERLAY_STYLE.skeletonStrokeWidth * 0.32)}
            strokeLinecap="round"
            opacity={0.95}
          />
        );
      })}
      {entries.map((joint) => {
        const role = getPreviewJointRole(joint.name as never);
        return (
          <circle
            key={joint.name}
            cx={joint.point.x * pose.canvas.widthRef}
            cy={joint.point.y * pose.canvas.heightRef}
            r={role === "nose" || role === "hip" ? 3 : 2.25}
            fill={role === "nose" ? PREVIEW_OVERLAY_STYLE.nose : role === "hip" ? PREVIEW_OVERLAY_STYLE.hip : PREVIEW_OVERLAY_STYLE.skeletonBase}
            opacity={0.95}
          />
        );
      })}
    </svg>
  );
}
