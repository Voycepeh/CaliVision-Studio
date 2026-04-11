"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PoseCanvas } from "@/components/studio/canvas/PoseCanvas";
import { buildAnimationTimeline, sampleAnimationTimeline } from "@/lib/animation/preview";
import { formatStoredDrillSourceLabel, type StoredDrillSourceKind } from "@/lib/drill-source";
import { mapPortablePoseToCanvasPoseModel } from "@/lib/package/mapping/canvas-view-models";
import type { PortableDrill, PortablePhase, PortableViewType } from "@/lib/schema/contracts";

type DrillSelectionPreviewPanelProps = {
  drill: PortableDrill;
  sourceKind?: StoredDrillSourceKind;
  showSourceBadge?: boolean;
  compact?: boolean;
  quiet?: boolean;
};

function sortPhases(phases: PortablePhase[]): PortablePhase[] {
  return [...phases].sort((a, b) => a.order - b.order);
}

function formatDrillTypeLabel(drillType: PortableDrill["drillType"]): string {
  return drillType === "rep" ? "Rep" : "Hold";
}

function formatViewLabel(view: PortableViewType): string {
  if (view === "front") return "Front";
  if (view === "rear") return "Rear";
  return "Side";
}

function resolvePreviewPhases(drill: PortableDrill): PortablePhase[] {
  const phases = sortPhases(drill.phases);
  if (drill.drillType !== "hold") {
    return phases;
  }

  if (phases.length === 0) {
    return phases;
  }

  const authoredHoldPhaseId = drill.analysis?.targetHoldPhaseId;
  const authoredHoldPhase = authoredHoldPhaseId ? phases.find((phase) => phase.phaseId === authoredHoldPhaseId) : undefined;
  const primaryPhase = authoredHoldPhase ?? phases[0];
  return primaryPhase ? [primaryPhase] : [];
}

export function DrillSelectionPreviewPanel({ drill, sourceKind, showSourceBadge = false, compact = false, quiet = false }: DrillSelectionPreviewPanelProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const frameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  const previewPhases = useMemo(() => resolvePreviewPhases(drill), [drill]);
  const previewMode = drill.drillType === "hold" ? "static" : "animated";
  const timeline = useMemo(() => buildAnimationTimeline(previewPhases, { mode: previewMode }), [previewMode, previewPhases]);
  const previewResetKey = useMemo(
    () =>
      [
        sourceKind ?? "local",
        drill.drillId,
        drill.drillType,
        ...drill.phases
          .map(
            (phase) =>
              `${phase.phaseId}:${phase.order}:${phase.durationMs}:${phase.poseSequence.length}:${phase.poseSequence.map((pose) => pose.poseId).join(",")}`
          )
          .sort()
      ].join("|"),
    [drill.drillId, drill.drillType, drill.phases, sourceKind]
  );

  useEffect(() => {
    setElapsedMs(0);
    setIsPlaying(drill.drillType === "rep");
  }, [drill.drillType, previewResetKey]);

  useEffect(() => {
    if (drill.drillType === "hold" || !isPlaying || timeline.totalDurationMs <= 0) {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      lastTickRef.current = null;
      return;
    }

    const tick = (timestamp: number) => {
      if (lastTickRef.current == null) {
        lastTickRef.current = timestamp;
      }

      const deltaMs = timestamp - lastTickRef.current;
      lastTickRef.current = timestamp;

      setElapsedMs((current) => {
        const next = current + deltaMs;
        if (timeline.totalDurationMs <= 0) {
          return 0;
        }
        return next % timeline.totalDurationMs;
      });

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
      lastTickRef.current = null;
    };
  }, [drill.drillType, isPlaying, timeline.totalDurationMs]);

  const sampledFrame = useMemo(() => sampleAnimationTimeline(timeline, elapsedMs), [timeline, elapsedMs]);
  const poseModel = useMemo(() => mapPortablePoseToCanvasPoseModel(sampledFrame.pose), [sampledFrame.pose]);

  const phaseStateLabel = useMemo(() => {
    if (drill.drillType === "rep") {
      return sampledFrame.phaseId ? `Phase ${sampledFrame.phaseIndex + 1} of ${previewPhases.length}` : "No phase data";
    }
    return "Hold posture";
  }, [drill.drillType, previewPhases.length, sampledFrame.phaseId, sampledFrame.phaseIndex]);

  return (
    <section
      className="card"
      style={{
        margin: 0,
        display: "grid",
        gap: compact ? "0.35rem" : "0.5rem",
        background: quiet ? "rgba(114,168,255,0.04)" : "rgba(114,168,255,0.08)",
        borderColor: quiet ? "rgba(130, 159, 192, 0.26)" : undefined
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <strong style={{ fontSize: compact ? "0.84rem" : "1rem" }}>{drill.title}</strong>
          <div className="muted" style={{ fontSize: compact ? "0.78rem" : "0.85rem", display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
            <span>Type: {formatDrillTypeLabel(drill.drillType)}</span>
            <span>View: {formatViewLabel(drill.primaryView)}</span>
            <span>Phases: {drill.phases.length}</span>
          </div>
        </div>
        {showSourceBadge ? (
          <span className="pill" style={{ opacity: 0.75, fontSize: "0.74rem" }}>
            {formatStoredDrillSourceLabel(sourceKind ?? "local")}
          </span>
        ) : null}
      </div>

      <div style={{ maxWidth: compact ? 260 : undefined }}>
        <PoseCanvas
          pose={poseModel}
          title="Motion preview"
          subtitle={drill.drillType === "hold" ? phaseStateLabel : `${phaseStateLabel} · ${sampledFrame.phaseTitle}`}
          editable={false}
          showPoseLayer
          sizeMode={compact ? "default" : "balanced"}
        />
      </div>

      {!compact && drill.drillType === "rep" ? (
        <div className="studio-animation-controls" style={{ marginTop: 0 }}>
          <button type="button" onClick={() => setIsPlaying((current) => !current)} disabled={timeline.totalDurationMs <= 0}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => {
              setElapsedMs(0);
              setIsPlaying(true);
            }}
            disabled={timeline.totalDurationMs <= 0}
          >
            Replay
          </button>
        </div>
      ) : null}
    </section>
  );
}
