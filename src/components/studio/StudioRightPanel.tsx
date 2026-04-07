"use client";

import { useMemo } from "react";
import { StudioInspectorAccordion } from "@/components/studio/StudioInspectorAccordion";
import { useStudioState } from "@/components/studio/StudioState";
import { getPrimaryDrill, getSortedPhases } from "@/lib/editor/package-editor";

export function StudioRightPanel() {
  const { selectedPackage, selectedPhaseId, selectedPhaseSourceImage, selectedPhaseDetection } = useStudioState();

  const selectedPhase = useMemo(() => {
    if (!selectedPackage) {
      return null;
    }

    return getSortedPhases(selectedPackage.workingPackage).find((phase) => phase.phaseId === selectedPhaseId) ?? null;
  }, [selectedPackage, selectedPhaseId]);

  const drill = selectedPackage ? getPrimaryDrill(selectedPackage.workingPackage) : null;

  return (
    <div className="panel-content studio-scrollable-panel" style={{ display: "grid", gap: "0.7rem", alignContent: "start" }}>
      <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>Details & diagnostics</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Quick context for the selected drill and phase, plus technical diagnostics when needed.
      </p>

      <StudioInspectorAccordion title="Drill identity and save state" >
        {selectedPackage && drill ? (
          <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
            <li>Drill file ID: {selectedPackage.workingPackage.manifest.packageId}</li>
            <li>Drill ID: {drill.drillId}</li>
            <li>Selected phase ID: {selectedPhase?.phaseId ?? "none"}</li>
            <li>Drill file version: {selectedPackage.workingPackage.manifest.packageVersion}</li>
            <li>Dirty state: {selectedPackage.isDirty ? "unsaved changes" : "saved"}</li>
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Open a drill to view details.</p>
        )}
      </StudioInspectorAccordion>

      <StudioInspectorAccordion title="Detection state" >
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
      </StudioInspectorAccordion>

      <StudioInspectorAccordion title="Drill file asset details" >
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
      </StudioInspectorAccordion>

      <StudioInspectorAccordion title="Validation internals" >
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
      </StudioInspectorAccordion>
    </div>
  );
}
