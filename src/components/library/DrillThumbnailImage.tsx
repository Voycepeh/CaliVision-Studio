"use client";

import { useMemo, useState } from "react";
import { resolveDrillThumbnail } from "@/lib/drills/thumbnail";
import type { PortableAssetRef, PortableDrill } from "@/lib/schema/contracts";

type Props = {
  drill: PortableDrill;
  assets?: PortableAssetRef[];
  height?: number;
  width?: number | string;
  variant?: "compact" | "feature";
};

export function DrillThumbnailImage({ drill, assets = [], height = 120, width = "100%", variant = "feature" }: Props) {
  const resolved = useMemo(() => resolveDrillThumbnail(drill, assets), [assets, drill]);
  const [imgError, setImgError] = useState(false);
  const fallback = useMemo(() => resolveDrillThumbnail(drill, []), [drill]);
  const src = imgError ? fallback.src : resolved.src;

  const compact = variant === "compact";

  return (
    <div
      style={{
        borderRadius: compact ? "0.65rem" : "0.7rem",
        overflow: "hidden",
        border: "1px solid rgba(148, 163, 184, 0.25)",
        background: "#0f172a",
        width,
        maxWidth: "100%"
      }}
    >
      <img
        src={src}
        alt={`${drill.title || "Drill"} thumbnail`}
        style={{ width: "100%", height, display: "block", objectFit: "cover" }}
        onError={() => setImgError(true)}
      />
    </div>
  );
}
