"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PoseCanvas } from "@/components/studio/canvas/PoseCanvas";
import { buildAnimationTimeline, sampleAnimationTimeline } from "@/lib/animation/preview";
import { mapPortablePoseToCanvasPoseModel } from "@/lib/package/mapping/canvas-view-models";
import type { PortableDrill, PortablePhase, PortableViewType } from "@/lib/schema/contracts";

const HOLD_LOOP_HOLD_RATIO = 0.7;

type DrillSelectionPreviewPanelProps = {
  drill: PortableDrill;
  sourceKind?: "seeded" | "local" | "hosted";
  showSourceBadge?: boolean;
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

function formatSourceLabel(sourceKind: DrillSelectionPreviewPanelProps["sourceKind"]): string {
  if (sourceKind === "hosted") return "Hosted";
  if (sourceKind === "local") return "Local";
  return "Seeded";
}

function createLoopPhases(drill: PortableDrill): PortablePhase[] {
  const phases = sortPhases(drill.phases);
  if (drill.drillType === "rep") {
    return phases;
  }

  if (phases.length === 0) {
    return phases;
  }

  const entryPhase = phases[0];
  const exitPhase: PortablePhase = {
    ...entryPhase,
    phaseId: `${entryPhase.phaseId}_exit_preview`,
    title: "Exit",
    durationMs: Math.max(300, Math.round(entryPhase.durationMs * (1 - HOLD_LOOP_HOLD_RATIO)))
  };

  return [
    {
      ...entryPhase,
      durationMs: Math.max(300, Math.round(entryPhase.durationMs))
    },
    ...phases.slice(1).map((phase, index) => ({
      ...phase,
      durationMs: Math.max(600, Math.round(phase.durationMs * (index === 0 ? HOLD_LOOP_HOLD_RATIO : 1)))
    })),
    exitPhase
  ];
}

export function buildDrillOptionLabel(drill: PortableDrill): string {
  return `${drill.title} · ${formatDrillTypeLabel(drill.drillType)} · ${formatViewLabel(drill.defaultView)}`;
}

export function DrillSelectionPreviewPanel({ drill, sourceKind, showSourceBadge = false }: DrillSelectionPreviewPanelProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const frameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  const loopPhases = useMemo(() => createLoopPhases(drill), [drill]);
  const timeline = useMemo(() => buildAnimationTimeline(loopPhases), [loopPhases]);

  useEffect(() => {
    setElapsedMs(0);
    setIsPlaying(true);
  }, [drill.drillId]);

  useEffect(() => {
    if (!isPlaying || timeline.totalDurationMs <= 0) {
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
  }, [isPlaying, timeline.totalDurationMs]);

  const sampledFrame = useMemo(() => sampleAnimationTimeline(timeline, elapsedMs), [timeline, elapsedMs]);
  const poseModel = useMemo(() => mapPortablePoseToCanvasPoseModel(sampledFrame.pose), [sampledFrame.pose]);

  const phaseStateLabel = useMemo(() => {
    if (drill.drillType === "rep") {
      return sampledFrame.phaseId ? `Phase ${sampledFrame.phaseIndex + 1} of ${loopPhases.length}` : "No phase data";
    }
    if (loopPhases.length < 2) {
      return "Hold posture";
    }
    const activeTitle = sampledFrame.phaseTitle.toLowerCase();
    if (activeTitle.includes("exit")) return "Exit posture";
    if (sampledFrame.phaseIndex === 0) return "Entry posture";
    return "Hold posture";
  }, [drill.drillType, loopPhases.length, sampledFrame.phaseId, sampledFrame.phaseIndex, sampledFrame.phaseTitle]);

  return (
    <section className="card" style={{ margin: 0, display: "grid", gap: "0.6rem", background: "rgba(114,168,255,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "0.2rem" }}>
          <strong style={{ fontSize: "1rem" }}>{drill.title}</strong>
          <div className="muted" style={{ fontSize: "0.85rem", display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
            <span>Type: {formatDrillTypeLabel(drill.drillType)}</span>
            <span>View: {formatViewLabel(drill.defaultView)}</span>
            <span>Phases: {drill.phases.length}</span>
          </div>
        </div>
        {showSourceBadge ? (
          <span className="pill" style={{ opacity: 0.75, fontSize: "0.74rem" }}>
            {formatSourceLabel(sourceKind)}
          </span>
        ) : null}
      </div>

      <PoseCanvas
        pose={poseModel}
        title="Motion preview"
        subtitle={`${phaseStateLabel} · ${sampledFrame.phaseTitle}`}
        editable={false}
        showPoseLayer
        sizeMode="balanced"
      />

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
    </section>
  );
}
