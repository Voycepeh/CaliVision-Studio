"use client";

import { DrillVisualPreview } from "@/components/library/DrillVisualPreview";
import type { PortableAssetRef, PortableDrill } from "@/lib/schema/contracts";

type Props = {
  drill: PortableDrill;
  assets?: PortableAssetRef[];
  height?: number;
  width?: number | string;
  variant?: "compact" | "feature";
};

export function DrillThumbnailImage({ drill, assets = [], height = 120, width = "100%", variant = "feature" }: Props) {
  return <DrillVisualPreview drill={drill} assets={assets} variant={variant} width={width} height={height} showMotionPreview={false} motionMode="none" />;
}
