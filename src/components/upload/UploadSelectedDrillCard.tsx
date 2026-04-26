"use client";

import { DrillVisualPreview } from "@/components/library/DrillVisualPreview";
import { formatStoredDrillSourceLabel, type StoredDrillSourceKind } from "@/lib/drill-source";
import { summarizeBenchmark } from "@/lib/drills/benchmark";
import { resolveDrillThumbnail } from "@/lib/drills/thumbnail";
import type { PortableAssetRef, PortableDrill } from "@/lib/schema/contracts";

type UploadSelectedDrillCardProps = {
  drill: PortableDrill | null;
  sourceKind?: StoredDrillSourceKind;
  benchmarkState?: "available" | "unavailable" | "legacy-missing";
  assets?: PortableAssetRef[];
};

function formatDrillTypeLabel(drillType: PortableDrill["drillType"]): string {
  return drillType === "rep" ? "Rep" : "Hold";
}

function formatViewLabel(view: PortableDrill["primaryView"]): string {
  if (view === "front") return "Front";
  if (view === "rear") return "Rear";
  return "Side";
}

function formatWorkspaceLabel(sourceKind?: StoredDrillSourceKind): string | null {
  if (!sourceKind) return null;
  if (sourceKind === "hosted") return "Cloud workspace";
  if (sourceKind === "exchange") return "Drill Exchange";
  return "Browser workspace";
}

export function UploadSelectedDrillCard({ drill, sourceKind, benchmarkState, assets = [] }: UploadSelectedDrillCardProps) {
  if (!drill) {
    return (
      <section className="upload-selected-drill-card" aria-live="polite">
        <p className="upload-selected-drill-eyebrow">Selected drill for analysis</p>
        <strong>Freestyle overlay mode</strong>
        <p className="muted upload-selected-drill-note">
          No drill is selected. Upload analysis will run with pose overlay and replay surfaces, without drill-specific rep, hold, or phase scoring.
        </p>
      </section>
    );
  }

  const benchmarkSummary = summarizeBenchmark(drill.benchmark);
  const fallbackBenchmarkState = benchmarkSummary.present ? "available" : "unavailable";
  const resolvedBenchmarkState = benchmarkState ?? fallbackBenchmarkState;
  const benchmarkLabel = resolvedBenchmarkState === "legacy-missing"
    ? "Benchmark unavailable (legacy)"
    : resolvedBenchmarkState === "available"
      ? "Benchmark available"
      : "Benchmark unavailable";
  const workspaceLabel = formatWorkspaceLabel(sourceKind);
  const thumbnail = resolveDrillThumbnail(drill, assets);

  return (
    <section className="upload-selected-drill-card" aria-live="polite">
      <p className="upload-selected-drill-eyebrow">Selected drill for analysis</p>
      <div className="upload-selected-drill-layout">
        <DrillVisualPreview
          drill={drill}
          assets={assets}
          variant="feature"
          width={172}
          height={98}
          showMotionPreview
          motionMode="inset"
        />
        <div className="upload-selected-drill-content">
          <strong className="upload-selected-drill-title">{drill.title}</strong>
          <div className="upload-selected-drill-chips muted">
            <span>Type: {formatDrillTypeLabel(drill.drillType)}</span>
            <span>Phases: {drill.phases.length}</span>
            <span>Camera view: {formatViewLabel(drill.primaryView)}</span>
            <span>{benchmarkLabel}</span>
            <span>Thumbnail: {thumbnail.source === "fallback" ? "Fallback" : "Available"}</span>
            {sourceKind ? <span>Source: {formatStoredDrillSourceLabel(sourceKind)}</span> : null}
            {workspaceLabel ? <span>Workspace: {workspaceLabel}</span> : null}
          </div>
          <p className="muted upload-selected-drill-note">This drill will be used when you upload and run analysis.</p>
        </div>
      </div>
    </section>
  );
}
