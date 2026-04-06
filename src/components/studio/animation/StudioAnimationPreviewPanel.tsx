"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PoseCanvas } from "@/components/studio/canvas/PoseCanvas";
import { useStudioState } from "@/components/studio/StudioState";
import { buildAnimationTimeline, sampleAnimationTimeline } from "@/lib/animation/preview";
import { getSortedPhases } from "@/lib/editor/package-editor";
import { mapPortablePoseToCanvasPoseModel } from "@/lib/package/mapping/canvas-view-models";

const PLAYBACK_SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function StudioAnimationPreviewPanel() {
  const { selectedPackage } = useStudioState();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [elapsedMs, setElapsedMs] = useState(0);
  const frameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  const phases = useMemo(() => (selectedPackage ? getSortedPhases(selectedPackage.workingPackage) : []), [selectedPackage]);
  const timeline = useMemo(() => buildAnimationTimeline(phases), [phases]);

  useEffect(() => {
    if (timeline.totalDurationMs <= 0) {
      setElapsedMs(0);
      setIsPlaying(false);
      return;
    }

    setElapsedMs((current) => Math.min(current, timeline.totalDurationMs));
  }, [timeline.totalDurationMs]);

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

      const deltaMs = (timestamp - lastTickRef.current) * speedMultiplier;
      lastTickRef.current = timestamp;

      setElapsedMs((current) => {
        const next = current + deltaMs;
        if (next < timeline.totalDurationMs) {
          return next;
        }

        if (loopEnabled && timeline.totalDurationMs > 0) {
          return next % timeline.totalDurationMs;
        }

        setIsPlaying(false);
        return timeline.totalDurationMs;
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
  }, [isPlaying, loopEnabled, speedMultiplier, timeline.totalDurationMs]);

  const sampledFrame = useMemo(() => sampleAnimationTimeline(timeline, elapsedMs), [timeline, elapsedMs]);
  const poseModel = useMemo(() => mapPortablePoseToCanvasPoseModel(sampledFrame.pose), [sampledFrame.pose]);
  const totalSeconds = timeline.totalDurationMs > 0 ? (timeline.totalDurationMs / 1000).toFixed(2) : "0.00";

  return (
    <section className="card studio-animation-preview-card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Animation preview</h3>
        <button type="button" className="studio-animation-toggle" onClick={() => setIsExpanded((current) => !current)}>
          {isExpanded ? "Collapse" : "Expand"}
        </button>
      </div>

      <p className="muted" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
        Preview uses canonical phase poses and timing from the current editor state. {isExpanded ? "" : "Expand to inspect motion flow."}
      </p>

      {isExpanded ? (
        <div className="studio-animation-preview-body">
          <PoseCanvas
            pose={poseModel}
            title="Canonical sequence preview"
            subtitle={sampledFrame.phaseId ? `Phase ${sampledFrame.phaseIndex + 1}: ${sampledFrame.phaseTitle}` : "No active phase"}
            showPoseLayer
            editable={false}
          />

          <div className="studio-animation-controls">
            <button type="button" onClick={() => setIsPlaying(true)} disabled={timeline.totalDurationMs <= 0 || isPlaying}>
              Play
            </button>
            <button type="button" onClick={() => setIsPlaying(false)} disabled={!isPlaying}>
              Pause
            </button>
            <button
              type="button"
              onClick={() => {
                setElapsedMs(0);
                setIsPlaying(false);
              }}
              disabled={timeline.totalDurationMs <= 0}
            >
              Restart
            </button>
            <button type="button" onClick={() => setLoopEnabled((current) => !current)} disabled={timeline.totalDurationMs <= 0}>
              Loop: {loopEnabled ? "On" : "Off"}
            </button>

            <label className="muted" style={{ display: "grid", gap: "0.15rem", marginLeft: "auto" }}>
              <span>Speed</span>
              <select value={speedMultiplier} onChange={(event) => setSpeedMultiplier(Number(event.target.value))}>
                {PLAYBACK_SPEED_OPTIONS.map((speed) => (
                  <option key={speed} value={speed}>
                    {speed}x
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field-grid" style={{ marginTop: "0.55rem" }}>
            <p className="muted" style={{ margin: 0 }}>
              Current phase: {sampledFrame.phaseId ? `${sampledFrame.phaseIndex + 1}/${timeline.segments.length}` : "n/a"}
            </p>
            <p className="muted" style={{ margin: 0 }}>Total sequence time: {totalSeconds}s</p>
            <p className="muted" style={{ margin: 0 }}>
              Timeline progress: {timeline.totalDurationMs > 0 ? `${Math.round((sampledFrame.elapsedMs / timeline.totalDurationMs) * 100)}%` : "0%"}
            </p>
            <p className="muted" style={{ margin: 0 }}>Timing mode: each phase duration is a transition segment to the next phase pose.</p>
          </div>

          {timeline.segments.length > 0 ? (
            <div style={{ marginTop: "0.6rem", display: "grid", gap: "0.35rem" }}>
              {timeline.segments.map((segment, index) => (
                <div key={segment.phaseId} className="studio-animation-segment" data-active={index === sampledFrame.phaseIndex}>
                  <strong>
                    {index + 1}. {segment.title}
                  </strong>
                  <span className="muted">
                    {segment.durationMs}ms{segment.durationAdjusted ? ` (from ${segment.sourceDurationMs}ms)` : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {timeline.warnings.length > 0 ? (
            <ul style={{ marginBottom: 0, marginTop: "0.65rem", paddingLeft: "1rem" }}>
              {timeline.warnings.map((warning) => (
                <li key={`${warning.severity}-${warning.message}`} className="muted">
                  {warning.severity === "warning" ? "Warning" : "Note"}: {warning.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
