"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useStudioState } from "@/components/studio/StudioState";
import { getPrimaryDrill } from "@/lib/editor/package-editor";
import { hasBenchmarkTiming, summarizeBenchmark } from "@/lib/drills/benchmark";

const SOURCE_TYPE_OPTIONS = [
  "none",
  "builtin",
  "seeded",
  "reference_pose_sequence",
  "reference_session",
  "reference_video"
] as const;

export function StudioBenchmarkEditor() {
  const {
    selectedPackage,
    setBenchmarkEnabled,
    setBenchmarkSourceType,
    setBenchmarkLabel,
    setBenchmarkDescription,
    setBenchmarkMovementType,
    setBenchmarkCameraView,
    setBenchmarkStatus,
    bootstrapBenchmarkFromAuthoredPhases,
    updateBenchmarkPhase,
    moveBenchmarkPhase
  } = useStudioState();

  const drill = selectedPackage ? getPrimaryDrill(selectedPackage.workingPackage) : null;
  const benchmark = drill?.benchmark ?? null;
  const summary = useMemo(() => summarizeBenchmark(benchmark), [benchmark]);

  if (!drill) {
    return null;
  }

  const benchmarkEnabled = benchmark !== null;
  const phases = benchmark?.phaseSequence ?? [];

  function runBootstrap(): void {
    if (!benchmarkEnabled || phases.length === 0) {
      bootstrapBenchmarkFromAuthoredPhases(false);
      return;
    }

    if (window.confirm("Overwrite benchmark phases using current authored drill phases? Existing benchmark phase edits will be replaced.")) {
      bootstrapBenchmarkFromAuthoredPhases(true);
    }
  }

  return (
    <section className="card" style={{ display: "grid", gap: "0.6rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Reference criteria</h3>
        <label style={{ ...labelStyle, display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem" }}>
          <input type="checkbox" checked={benchmarkEnabled} onChange={(event) => setBenchmarkEnabled(event.target.checked)} />
          Comparison settings enabled
        </label>
      </div>

      <div className="muted" style={{ fontSize: "0.78rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        <span>{summary.present ? "Reference criteria present" : "Reference criteria absent"}</span>
        <span>Source: {summary.sourceType}</span>
        <span>Phases: {summary.phaseCount}</span>
        <span>{summary.hasTiming ? "Timing available" : "No timing"}</span>
        <span>Status: {summary.status ?? "draft"}</span>
      </div>

      {benchmarkEnabled ? (
        <>
          <div className="field-grid">
            <label style={labelStyle}>
              <span>Source type</span>
              <select value={benchmark?.sourceType ?? "reference_pose_sequence"} onChange={(event) => setBenchmarkSourceType(event.target.value as (typeof SOURCE_TYPE_OPTIONS)[number])} style={inputStyle}>
                {SOURCE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              <span>Status</span>
              <select value={benchmark?.status ?? "draft"} onChange={(event) => setBenchmarkStatus(event.target.value as "draft" | "ready")} style={inputStyle}>
                <option value="draft">draft</option>
                <option value="ready">ready</option>
              </select>
            </label>
          </div>

          <div className="field-grid">
            <label style={labelStyle}>
              <span>Movement type</span>
              <select value={benchmark?.movementType ?? drill.drillType} onChange={(event) => setBenchmarkMovementType(event.target.value as "hold" | "rep")} style={inputStyle}>
                <option value="hold">hold</option>
                <option value="rep">rep</option>
              </select>
            </label>

            <label style={labelStyle}>
              <span>Camera view</span>
              <select value={benchmark?.cameraView ?? drill.primaryView} onChange={(event) => setBenchmarkCameraView(event.target.value as "front" | "side" | "rear")} style={inputStyle}>
                <option value="front">front</option>
                <option value="side">side</option>
                <option value="rear">rear</option>
              </select>
            </label>
          </div>

          <label style={labelStyle}>
            <span>Benchmark label</span>
            <input value={benchmark?.label ?? ""} onChange={(event) => setBenchmarkLabel(event.target.value)} style={inputStyle} placeholder="Add benchmark label" />
          </label>

          <label style={labelStyle}>
            <span>Benchmark description</span>
            <textarea value={benchmark?.description ?? ""} onChange={(event) => setBenchmarkDescription(event.target.value)} style={{ ...inputStyle, minHeight: "64px", resize: "vertical" }} placeholder="Optional benchmark notes" />
          </label>

          <div className="studio-action-row" style={{ justifyContent: "flex-start" }}>
            <button type="button" className="studio-button studio-button-primary" onClick={runBootstrap}>
              {phases.length > 0 ? "Sync benchmark from authored phases" : "Create benchmark from drill phases"}
            </button>
            <span className="muted" style={{ fontSize: "0.75rem" }}>
              {phases.length > 0 ? "Re-sync replaces benchmark phase sequence after confirmation." : "Bootstraps benchmark phase sequence from current drill phases."}
            </span>
          </div>

          {phases.length > 0 ? (
            <div style={{ display: "grid", gap: "0.4rem" }}>
              {phases.map((phase, index) => (
                <article key={`${phase.key}-${index}`} className="card" style={{ display: "grid", gap: "0.35rem", padding: "0.6rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: "0.83rem" }}>Benchmark phase #{index + 1}</strong>
                    <div className="studio-action-row">
                      <button type="button" className="studio-button" onClick={() => moveBenchmarkPhase(phase.key, "up")} disabled={index === 0}>↑</button>
                      <button type="button" className="studio-button" onClick={() => moveBenchmarkPhase(phase.key, "down")} disabled={index === phases.length - 1}>↓</button>
                    </div>
                  </div>

                  <div className="field-grid">
                    <label style={labelStyle}>
                      <span>Key</span>
                      <input value={phase.key} onChange={(event) => updateBenchmarkPhase(phase.key, { key: event.target.value })} style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      <span>Label</span>
                      <input value={phase.label ?? ""} onChange={(event) => updateBenchmarkPhase(phase.key, { label: event.target.value })} style={inputStyle} />
                    </label>
                  </div>

                  <div className="field-grid">
                    <label style={labelStyle}>
                      <span>Target duration (ms)</span>
                      <input
                        type="number"
                        min={0}
                        value={phase.targetDurationMs ?? ""}
                        onChange={(event) =>
                          updateBenchmarkPhase(phase.key, {
                            targetDurationMs: event.target.value ? Number.parseInt(event.target.value, 10) : undefined
                          })
                        }
                        style={inputStyle}
                      />
                    </label>
                    <label style={labelStyle}>
                      <span>Pose</span>
                      <input value={phase.pose ? "Carried from authored phase" : "None"} style={inputStyle} readOnly />
                    </label>
                  </div>

                  <label style={labelStyle}>
                    <span>Notes</span>
                    <textarea value={phase.notes ?? ""} onChange={(event) => updateBenchmarkPhase(phase.key, { notes: event.target.value })} style={{ ...inputStyle, minHeight: "52px", resize: "vertical" }} />
                  </label>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
              Benchmark enabled, but no benchmark phases yet. Use the bootstrap action to copy authored phase order and starter timing.
            </p>
          )}

          {hasBenchmarkTiming(benchmark) ? null : (
            <p className="muted" style={{ margin: 0, fontSize: "0.75rem" }}>
              This benchmark currently has no timing data. Add target durations to benchmark phases for comparison-ready timing context.
            </p>
          )}
        </>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
          Enable benchmark to author benchmark metadata and phase sequence for this drill.
        </p>
      )}
    </section>
  );
}

const labelStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
  color: "var(--muted)",
  fontSize: "0.82rem"
};

const inputStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  background: "var(--panel-soft)",
  color: "var(--text)",
  padding: "0.42rem"
};
