"use client";

import { useMemo } from "react";
import { useStudioState } from "@/components/studio/StudioState";
import { getPrimaryDrill, getSortedPhases } from "@/lib/editor/package-editor";

export function StudioRightPanel() {
  const {
    selectedPackage,
    selectedPhaseId,
    selectedPhaseSourceImage,
    selectedPhaseDetection,
    setManifestSchemaVersion,
    setManifestPackageVersion
  } = useStudioState();

  const selectedPhase = useMemo(() => {
    if (!selectedPackage) {
      return null;
    }

    return getSortedPhases(selectedPackage.workingPackage).find((phase) => phase.phaseId === selectedPhaseId) ?? null;
  }, [selectedPackage, selectedPhaseId]);

  const drill = selectedPackage ? getPrimaryDrill(selectedPackage.workingPackage) : null;

  return (
    <section style={{ display: "grid", gap: "0.7rem", alignContent: "start" }}>
      <p className="muted" style={{ margin: 0 }}>
        Internal IDs, drill file compatibility details, and detection diagnostics.
      </p>

      {selectedPackage && drill ? (
        <div className="card" style={{ display: "grid", gap: "0.55rem" }}>
          <h4 style={{ margin: 0, fontSize: "0.92rem" }}>Drill file compatibility metadata</h4>
          <div className="field-grid">
            <label style={labelStyle}>
              <span>Drill file version (technical)</span>
              <input
                value={selectedPackage.workingPackage.manifest.packageVersion}
                onChange={(event) => setManifestPackageVersion(event.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              <span>Schema version (technical)</span>
              <select
                value={selectedPackage.workingPackage.manifest.schemaVersion}
                onChange={(event) => setManifestSchemaVersion(event.target.value as typeof selectedPackage.workingPackage.manifest.schemaVersion)}
                style={inputStyle}
              >
                <option value="0.1.0">0.1.0</option>
              </select>
            </label>
          </div>
          <label style={labelStyle}>
            <span>Internal drill ID (system-generated)</span>
            <input value={drill.drillId} style={inputStyle} readOnly />
          </label>
        </div>
      ) : null}

      <section className="card" style={{ display: "grid", gap: "0.45rem" }}>
        <h4 style={{ margin: 0, fontSize: "0.92rem" }}>Drill draft identity and save state</h4>
        {selectedPackage && drill ? (
          <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
            <li>Drill title: {drill.title}</li>
            <li>Drill ID: {drill.drillId}</li>
            <li>Selected phase ID: {selectedPhase?.phaseId ?? "none"}</li>
            <li>Drill file ID (technical): {selectedPackage.workingPackage.manifest.packageId}</li>
            <li>Drill file version (technical): {selectedPackage.workingPackage.manifest.packageVersion}</li>
            <li>Dirty state: {selectedPackage.isDirty ? "unsaved changes" : "saved"}</li>
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Open a drill to view details.</p>
        )}
      </section>

      <section className="card" style={{ display: "grid", gap: "0.45rem" }}>
        <h4 style={{ margin: 0, fontSize: "0.92rem" }}>Detection state</h4>
        {selectedPhase ? (
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <p className="muted" style={{ margin: 0 }}>Status: {selectedPhaseDetection.status}</p>
            <p className="muted" style={{ margin: 0 }}>{selectedPhaseDetection.message}</p>
            {selectedPhaseSourceImage ? (
              <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
                <li>Source image: {selectedPhaseSourceImage.fileName}</li>
                <li>Origin: {selectedPhaseSourceImage.origin}</li>
                <li>Portable URI: {selectedPhaseSourceImage.portableUri}</li>
              </ul>
            ) : (
              <p className="muted" style={{ margin: 0 }}>No image is attached to the selected phase.</p>
            )}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Select a phase to inspect detection workflow internals.</p>
        )}
      </section>

      <section className="card" style={{ display: "grid", gap: "0.45rem" }}>
        <h4 style={{ margin: 0, fontSize: "0.92rem" }}>Drill file asset manifest</h4>
        {selectedPackage ? (
          <ul className="muted" style={{ marginTop: 0, paddingLeft: "1rem" }}>
            <li>Total assets: {selectedPackage.workingPackage.assets.length}</li>
            <li>Packaged assets: {selectedPackage.workingPackage.assets.filter((asset) => asset.uri.startsWith("package://")).length}</li>
            <li>Phase images: {selectedPackage.workingPackage.assets.filter((asset) => asset.role === "phase-source-image").length}</li>
            <li>Thumbnails: {selectedPackage.workingPackage.assets.filter((asset) => asset.role === "drill-thumbnail").length}</li>
            <li>Previews: {selectedPackage.workingPackage.assets.filter((asset) => asset.role === "drill-preview").length}</li>
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>No drill selected.</p>
        )}
      </section>

      <section className="card" style={{ display: "grid", gap: "0.45rem" }}>
        <h4 style={{ margin: 0, fontSize: "0.92rem" }}>Validation internals</h4>
        {selectedPackage ? (
          <>
            <ul className="muted" style={{ marginTop: 0, paddingLeft: "1rem" }}>
              <li>Valid drill file: {selectedPackage.validation.isValid ? "yes" : "no"}</li>
              <li>Errors: {selectedPackage.validation.errors.length}</li>
              <li>Warnings: {selectedPackage.validation.warnings.length}</li>
              <li>Total issues: {selectedPackage.validation.issues.length}</li>
            </ul>
            {selectedPackage.validation.issues.length > 0 ? (
              <ul style={{ marginBottom: 0, paddingLeft: "1rem" }}>
                {selectedPackage.validation.issues.map((issue, index) => (
                  <li key={`${issue.path}-${index}`} className="muted">[{issue.severity}] {issue.path}: {issue.message}</li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ marginBottom: 0 }}>No validation issues.</p>
            )}
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Load a drill file to inspect validation internals.</p>
        )}
      </section>
    </section>
  );
}

const labelStyle = {
  display: "grid",
  gap: "0.2rem",
  color: "var(--muted)",
  fontSize: "0.85rem"
} as const;

const inputStyle = {
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  background: "var(--panel-soft)",
  color: "var(--text)",
  padding: "0.45rem"
} as const;
