"use client";

import { useMemo } from "react";
import { useStudioState } from "@/components/studio/StudioState";

export function WorkspacePanel() {
  const { packages, selectedPackageKey, selectedPhaseId, selectPhase } = useStudioState();
  const selectedPackage = packages.find((entry) => entry.packageKey === selectedPackageKey) ?? null;
  const drillView = selectedPackage?.primaryDrill ?? null;

  const selectedPhase = useMemo(
    () => drillView?.phases.find((phase) => phase.phaseId === selectedPhaseId) ?? null,
    [drillView, selectedPhaseId]
  );

  return (
    <div className="panel-content" style={{ display: "grid", gap: "0.8rem", alignContent: "start" }}>
      <header>
        <h2 style={{ marginTop: 0, marginBottom: "0.4rem" }}>Drill Workspace</h2>
        <p className="muted" style={{ margin: 0 }}>
          Inspect package metadata and choose a phase to drive canonical pose canvas preview in the inspector.
        </p>
      </header>

      {!selectedPackage || !drillView ? (
        <section className="card">
          <p className="muted" style={{ margin: 0 }}>
            No package loaded. Load a sample or import a local JSON package.
          </p>
        </section>
      ) : (
        <>
          <section className="card">
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Drill metadata</h3>
            <div className="field-grid">
              <Field label="Title" value={drillView.title} />
              <Field label="Difficulty" value={drillView.difficulty} />
              <Field label="Primary View" value={drillView.defaultView} />
              <Field label="Schema version" value={selectedPackage.package.manifest.schemaVersion} />
              <Field label="Package ID" value={selectedPackage.package.manifest.packageId} />
              <Field label="Package Version" value={selectedPackage.package.manifest.packageVersion} />
            </div>
          </section>

          <section className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
              <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Phase list</h3>
              <button
                type="button"
                onClick={() => selectPhase("")}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "999px",
                  background: "var(--panel-soft)",
                  color: "var(--muted)",
                  padding: "0.2rem 0.55rem",
                  cursor: "pointer"
                }}
              >
                Clear selection
              </button>
            </div>
            <div style={{ display: "grid", gap: "0.35rem" }}>
              {drillView.phases.map((phase) => (
                <button
                  key={phase.phaseId}
                  type="button"
                  onClick={() => selectPhase(phase.phaseId)}
                  style={{
                    border:
                      selectedPhase?.phaseId === phase.phaseId ? "1px solid var(--accent)" : "1px solid var(--border)",
                    borderRadius: "0.65rem",
                    padding: "0.55rem",
                    background: selectedPhase?.phaseId === phase.phaseId ? "var(--accent-soft)" : "var(--panel-soft)",
                    color: "var(--text)",
                    textAlign: "left",
                    cursor: "pointer"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                    <strong>
                      {phase.order}. {phase.title}
                    </strong>
                    <span className="muted">{(phase.durationMs / 1000).toFixed(1)}s</span>
                  </div>
                  <small className="muted">
                    {phase.poseCount} poses • {phase.assetCount} assets
                    {phase.startOffsetMs !== undefined ? ` • starts ${phase.startOffsetMs}ms` : ""}
                  </small>
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Selected phase detail summary</h3>
            {selectedPhase ? (
              <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
                <li>Phase ID: {selectedPhase.phaseId}</li>
                <li>Order: {selectedPhase.order}</li>
                <li>Duration: {selectedPhase.durationMs}ms</li>
                <li>Poses: {selectedPhase.poseCount}</li>
                <li>Assets: {selectedPhase.assetCount}</li>
                <li>{selectedPhase.summary ?? "No summary provided."}</li>
              </ul>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No phase selected. Choose a phase to preview pose data on the canonical canvas.
              </p>
            )}
          </section>

          <section className="card">
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Package validation summary</h3>
            <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
              <li>Valid package: {selectedPackage.validation.isValid ? "yes" : "no"}</li>
              <li>Errors: {selectedPackage.validation.errors.length}</li>
              <li>Warnings: {selectedPackage.validation.warnings.length}</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "0.65rem",
        padding: "0.55rem 0.65rem",
        background: "var(--panel-soft)"
      }}
    >
      <small style={{ display: "block", color: "var(--muted)" }}>{label}</small>
      <span>{value}</span>
    </div>
  );
}
