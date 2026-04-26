"use client";

import { useMemo, useState } from "react";
import { resolveDrillThumbnail } from "@/lib/drills/thumbnail";
import type { PortableAssetRef, PortableDrill } from "@/lib/schema/contracts";

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
  return drill.phases.some((phase) => phase.poseSequence.length > 0);
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
  const canShowMotion = showMotionPreview && hasPhasePoseData(drill) && resolvedMode !== "none";

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
