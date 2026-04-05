"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { getSortedPhases } from "@/lib/editor/package-editor";
import { useStudioState } from "@/components/studio/StudioState";

export function StudioPhaseDetailsPanel() {
  const {
    selectedPackage,
    selectedPhaseId,
    selectPhase,
    renamePhase,
    setPhaseDuration,
    addPhase,
    deletePhase,
    duplicatePhase,
    movePhase,
    setPhaseSummary
  } = useStudioState();

  const phases = useMemo(() => (selectedPackage ? getSortedPhases(selectedPackage.workingPackage) : []), [selectedPackage]);
  const selectedPhase = useMemo(() => phases.find((phase) => phase.phaseId === selectedPhaseId) ?? null, [phases, selectedPhaseId]);

  if (!selectedPackage) {
    return (
      <div className="panel-content" style={{ display: "grid", gap: "0.8rem", alignContent: "start" }}>
        <h2 style={{ marginTop: 0, marginBottom: 0.4 }}>Details</h2>
        <section className="card"><p className="muted" style={{ margin: 0 }}>No drill package selected.</p></section>
      </div>
    );
  }

  return (
    <div className="panel-content" style={{ display: "grid", gap: "0.8rem", alignContent: "start" }}>
      <h2 style={{ marginTop: 0, marginBottom: 0 }}>Drill Details</h2>

      <section className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
          <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Phases</h3>
          <div style={{ display: "flex", gap: "0.35rem" }}>
            <button type="button" onClick={() => addPhase()} style={smallButtonStyle}>Add</button>
            <button type="button" onClick={() => selectPhase(null)} style={smallButtonStyle}>Clear</button>
          </div>
        </div>
        <div style={{ display: "grid", gap: "0.35rem" }}>
          {phases.map((phase, index) => (
            <div
              key={phase.phaseId}
              style={{
                border: selectedPhase?.phaseId === phase.phaseId ? "1px solid var(--accent)" : "1px solid var(--border)",
                borderRadius: "0.65rem",
                padding: "0.55rem",
                background: selectedPhase?.phaseId === phase.phaseId ? "var(--accent-soft)" : "var(--panel-soft)",
                display: "grid",
                gap: "0.45rem"
              }}
            >
              <button type="button" onClick={() => selectPhase(phase.phaseId)} style={phaseButtonStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                  <strong>{phase.order}. {phase.title}</strong>
                  <span className="muted">{(phase.durationMs / 1000).toFixed(1)}s</span>
                </div>
                <small className="muted">{phase.phaseId}</small>
              </button>

              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                <button type="button" onClick={() => movePhase(phase.phaseId, "up")} style={smallButtonStyle} disabled={index === 0}>Up</button>
                <button type="button" onClick={() => movePhase(phase.phaseId, "down")} style={smallButtonStyle} disabled={index === phases.length - 1}>Down</button>
                <button type="button" onClick={() => duplicatePhase(phase.phaseId)} style={smallButtonStyle}>Duplicate</button>
                <button type="button" onClick={() => deletePhase(phase.phaseId)} style={{ ...smallButtonStyle, borderColor: "rgba(232,131,131,0.45)", color: "#f2bbbb" }} disabled={phases.length <= 1}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Selected phase</h3>
        {selectedPhase ? (
          <div style={{ display: "grid", gap: "0.55rem" }}>
            <label style={labelStyle}>
              <span>Phase title</span>
              <input value={selectedPhase.title} onChange={(event) => renamePhase(selectedPhase.phaseId, event.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              <span>Duration (ms)</span>
              <input type="number" min={1} step={100} value={selectedPhase.durationMs} onChange={(event) => setPhaseDuration(selectedPhase.phaseId, Number(event.target.value))} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              <span>Notes</span>
              <textarea value={selectedPhase.summary ?? ""} onChange={(event) => setPhaseSummary(selectedPhase.phaseId, event.target.value)} style={{ ...inputStyle, minHeight: "74px", resize: "vertical" }} />
            </label>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Select a phase to edit details.</p>
        )}
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0, marginBottom: "0.4rem" }}>Validation summary</h3>
        <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
          <li>Valid package: {selectedPackage.validation.isValid ? "yes" : "no"}</li>
          <li>Errors: {selectedPackage.validation.errors.length}</li>
          <li>Warnings: {selectedPackage.validation.warnings.length}</li>
        </ul>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0, marginBottom: "0.4rem" }}>Source assets</h3>
        {selectedPhase && selectedPhase.assetRefs.length > 0 ? (
          <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
            {selectedPhase.assetRefs.map((asset) => (
              <li key={asset.assetId}>{asset.type} • {asset.assetId} • {asset.uri}</li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>No source assets on selected phase.</p>
        )}
      </section>
    </div>
  );
}

const smallButtonStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "999px",
  background: "var(--panel-soft)",
  color: "var(--text)",
  padding: "0.2rem 0.55rem",
  cursor: "pointer"
};

const phaseButtonStyle: CSSProperties = {
  textAlign: "left",
  border: "none",
  background: "transparent",
  color: "var(--text)",
  padding: 0,
  cursor: "pointer"
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
  color: "var(--muted)",
  fontSize: "0.85rem"
};

const inputStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  background: "var(--panel-soft)",
  color: "var(--text)",
  padding: "0.45rem"
};
