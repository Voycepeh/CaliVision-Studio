"use client";

import { useMemo } from "react";
import { PoseCanvas } from "@/components/studio/canvas/PoseCanvas";
import {
  mapPortablePhaseToInspectorViewModel,
  mapPortablePoseToCanvasPoseModel
} from "@/lib/package/mapping/canvas-view-models";
import { useStudioState } from "@/components/studio/StudioState";

export function InspectorPanel() {
  const { packages, selectedPackageKey, selectedPhaseId } = useStudioState();
  const selectedPackage = packages.find((entry) => entry.packageKey === selectedPackageKey) ?? null;
  const selectedDrill = selectedPackage?.package.drills[0] ?? null;

  const selectedPhase = useMemo(
    () => selectedDrill?.phases.find((phase) => phase.phaseId === selectedPhaseId) ?? null,
    [selectedDrill, selectedPhaseId]
  );

  const selectedPhaseSummary = selectedPhase ? mapPortablePhaseToInspectorViewModel(selectedPhase) : null;
  const selectedPose = selectedPhase?.poseSequence[0] ?? null;
  const poseModel = mapPortablePoseToCanvasPoseModel(selectedPose);

  return (
    <div className="panel-content">
      <h2 style={{ marginTop: 0 }}>Inspector & Preview</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Canonical pose canvas and phase metadata preview wired to package-first drill semantics.
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

          {selectedPhase ? (
            <>
              <PoseCanvas
                pose={poseModel}
                title="Canonical phase pose canvas"
                subtitle={`Phase ${selectedPhaseSummary?.order}: ${selectedPhaseSummary?.title}`}
                selected
              />

              <section className="card" style={{ minHeight: "92px" }}>
                <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Selected phase summary</h3>
                <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
                  <li>Phase ID: {selectedPhaseSummary?.phaseId}</li>
                  <li>Order: {selectedPhaseSummary?.order}</li>
                  <li>Duration: {selectedPhaseSummary?.durationMs}ms</li>
                  <li>View(s): {selectedPhaseSummary?.viewSummary}</li>
                  <li>Pose frames: {selectedPhaseSummary?.poseCount}</li>
                  <li>Assets: {selectedPhaseSummary?.assetCount}</li>
                </ul>
              </section>

              <section className="card" style={{ minHeight: "92px" }}>
                <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>
                  Source image/asset placeholder
                </h3>
                {selectedPhase.assetRefs.length > 0 ? (
                  <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
                    {selectedPhase.assetRefs.map((asset) => (
                      <li key={asset.assetId}>
                        {asset.type} • {asset.assetId} • {asset.uri}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    No source assets on this phase. Overlay/image rendering remains intentionally deferred.
                  </p>
                )}
              </section>

              {poseModel.warnings.length > 0 ? (
                <section className="card" style={{ minHeight: "92px", borderColor: "rgba(233, 180, 116, 0.55)" }}>
                  <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Pose data warnings</h3>
                  <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
                    {poseModel.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : (
            <section className="card">
              <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Pose canvas</h3>
              <p className="muted" style={{ margin: 0 }}>
                No phase selected. Choose a phase in the workspace to render the canonical pose surface.
              </p>
            </section>
          )}

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
