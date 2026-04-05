"use client";

import { useMemo } from "react";
import { DetectionWorkflowPanel } from "@/components/studio/detection/DetectionWorkflowPanel";
import { StudioMetadataEditor } from "@/components/studio/StudioMetadataEditor";
import { StudioPhaseDetailsPanel } from "@/components/studio/StudioPhaseDetailsPanel";
import { useStudioState } from "@/components/studio/StudioState";
import { getSortedPhases } from "@/lib/editor/package-editor";

export function StudioRightPanel() {
  const { selectedPackage, selectedPhaseId } = useStudioState();

  const selectedPhase = useMemo(() => {
    if (!selectedPackage) {
      return null;
    }

    return getSortedPhases(selectedPackage.workingPackage).find((phase) => phase.phaseId === selectedPhaseId) ?? null;
  }, [selectedPackage, selectedPhaseId]);

  return (
    <div className="panel-content studio-scrollable-panel" style={{ display: "grid", gap: "0.7rem", alignContent: "start" }}>
      <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>Drill Details</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Metadata, validation, and source details for packaging and export quality.
      </p>

      <StudioMetadataEditor />
      <StudioPhaseDetailsPanel />

      {selectedPhase ? <DetectionWorkflowPanel phaseId={selectedPhase.phaseId} /> : null}

      {selectedPhase ? (
        <section className="card">
          <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Phase source assets</h3>
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
              No source assets on this phase.
            </p>
          )}
        </section>
      ) : null}

      {selectedPackage ? (
        <section className="card">
          <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Validation summary</h3>
          <ul className="muted" style={{ marginTop: 0, paddingLeft: "1rem" }}>
            <li>Valid drill file: {selectedPackage.validation.isValid ? "yes" : "no"}</li>
            <li>Errors: {selectedPackage.validation.errors.length}</li>
            <li>Warnings: {selectedPackage.validation.warnings.length}</li>
            <li>Dirty state: {selectedPackage.isDirty ? "unsaved changes" : "saved"}</li>
          </ul>
          {selectedPackage.validation.issues.length === 0 ? (
            <p className="muted" style={{ marginBottom: 0 }}>
              No validation issues.
            </p>
          ) : (
            <ul style={{ marginBottom: 0, paddingLeft: "1rem" }}>
              {selectedPackage.validation.issues.map((issue, index) => (
                <li key={`${issue.path}-${index}`} className="muted">
                  [{issue.severity}] {issue.path}: {issue.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
