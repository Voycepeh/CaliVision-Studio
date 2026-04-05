"use client";

import { useMemo } from "react";
import { useStudioState } from "@/components/studio/StudioState";

export function InspectorPanel() {
  const { packages, selectedPackageKey, selectedPhaseId } = useStudioState();
  const selectedPackage = packages.find((entry) => entry.packageKey === selectedPackageKey) ?? null;
  const selectedDrill = selectedPackage?.primaryDrill ?? null;

  const selectedPhase = useMemo(
    () => selectedDrill?.phases.find((phase) => phase.phaseId === selectedPhaseId) ?? selectedDrill?.phases[0] ?? null,
    [selectedDrill, selectedPhaseId]
  );

  return (
    <div className="panel-content">
      <h2 style={{ marginTop: 0 }}>Inspector & Preview</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Package manifest, asset placeholders, and validation issue visibility.
      </p>

      {!selectedPackage ? (
        <section className="card">
          <p className="muted" style={{ margin: 0 }}>
            No selected package.
          </p>
        </section>
      ) : (
        <div style={{ display: "grid", gap: "0.7rem" }}>
          <section className="card" style={{ minHeight: "92px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Package manifest summary</h3>
            <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
              <li>Schema: {selectedPackage.package.manifest.schemaVersion}</li>
              <li>Source: {selectedPackage.package.manifest.source}</li>
              <li>Android min: {selectedPackage.package.manifest.compatibility.androidMinVersion}</li>
              <li>Android contract: {selectedPackage.package.manifest.compatibility.androidTargetContract}</li>
            </ul>
          </section>

          <section className="card" style={{ minHeight: "92px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Source image/asset placeholder</h3>
            {selectedPhase && selectedPhase.assetCount > 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Selected phase references {selectedPhase.assetCount} asset(s). URI preview hooks remain placeholder-only.
              </p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No phase assets referenced.
              </p>
            )}
          </section>

          <section className="card" style={{ minHeight: "92px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Pose summary placeholder</h3>
            {selectedPhase ? (
              <p className="muted" style={{ margin: 0 }}>
                {selectedPhase.phaseId}: {selectedPhase.poseCount} pose frame(s) available for future canvas visualization.
              </p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Select a phase to inspect pose metrics.
              </p>
            )}
          </section>

          <section className="card" style={{ minHeight: "92px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Validation issues</h3>
            {selectedPackage.validation.issues.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No validation issues.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "1rem" }}>
                {selectedPackage.validation.issues.map((issue, index) => (
                  <li key={`${issue.path}-${index}`} className="muted">
                    [{issue.severity}] {issue.path}: {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
