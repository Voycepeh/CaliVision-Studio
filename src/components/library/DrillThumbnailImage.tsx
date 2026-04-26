"use client";

import { useMemo, useState } from "react";
import { resolveDrillThumbnail } from "@/lib/drills/thumbnail";
import type { PortableAssetRef, PortableDrill } from "@/lib/schema/contracts";

type Props = {
  drill: PortableDrill;
  assets?: PortableAssetRef[];
  height?: number;
};

export function DrillThumbnailImage({ drill, assets = [], height = 120 }: Props) {
  const resolved = useMemo(() => resolveDrillThumbnail(drill, assets), [assets, drill]);
  const [imgError, setImgError] = useState(false);
  const fallback = useMemo(() => resolveDrillThumbnail(drill, []), [drill]);
  const src = imgError ? fallback.src : resolved.src;

  return (
    <div style={{ borderRadius: "0.7rem", overflow: "hidden", border: "1px solid rgba(148, 163, 184, 0.25)", background: "#0f172a" }}>
      <img
        src={src}
        alt={`${drill.title || "Drill"} thumbnail`}
        style={{ width: "100%", height, display: "block", objectFit: "cover" }}
        onError={() => setImgError(true)}
      />
    </div>
  );
}
