"use client";

import { useMemo } from "react";
import { StudioAnimationPreviewPanel } from "@/components/studio/animation/StudioAnimationPreviewPanel";
import { DetectionWorkflowPanel } from "@/components/studio/detection/DetectionWorkflowPanel";
import { StudioMetadataEditor } from "@/components/studio/StudioMetadataEditor";
import { StudioPhaseDetailsPanel } from "@/components/studio/StudioPhaseDetailsPanel";
import { useStudioState } from "@/components/studio/StudioState";
import { getSortedPhases } from "@/lib/editor/package-editor";

export function StudioRightPanel() {
  const { selectedPackage, selectedPhaseId, selectedPhaseSourceImage, selectedPhaseDetection } = useStudioState();

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
      <StudioAnimationPreviewPanel />

      {selectedPhase ? <DetectionWorkflowPanel phaseId={selectedPhase.phaseId} /> : null}

      {selectedPhase ? (
        <section className="card">
          <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Source image metadata</h3>
          {selectedPhaseSourceImage ? (
            <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
              <li>File: {selectedPhaseSourceImage.fileName}</li>
              <li>Type: {selectedPhaseSourceImage.mimeType}</li>
              <li>Dimensions: {selectedPhaseSourceImage.width}×{selectedPhaseSourceImage.height}</li>
              <li>Size: {Math.round(selectedPhaseSourceImage.byteSize / 1024)}KB</li>
              <li>Updated: {new Date(selectedPhaseSourceImage.updatedAtIso).toLocaleString()}</li>
              <li>Origin: {selectedPhaseSourceImage.origin}</li>
              <li>Portable URI: {selectedPhaseSourceImage.portableUri}</li>
            </ul>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              No source image currently loaded into editor state for this phase.
            </p>
          )}
          <p className="muted" style={{ marginBottom: 0 }}>
            Export now emits a bundled package that includes package:// assets when binary data is available locally.
          </p>
        </section>
      ) : null}

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
          <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Package asset manifest</h3>
          <ul className="muted" style={{ marginTop: 0, paddingLeft: "1rem" }}>
            <li>Total assets: {selectedPackage.workingPackage.assets.length}</li>
            <li>Packaged assets: {selectedPackage.workingPackage.assets.filter((asset) => asset.uri.startsWith("package://")).length}</li>
            <li>Phase images: {selectedPackage.workingPackage.assets.filter((asset) => asset.role === "phase-source-image").length}</li>
            <li>Thumbnails: {selectedPackage.workingPackage.assets.filter((asset) => asset.role === "drill-thumbnail").length}</li>
            <li>Previews: {selectedPackage.workingPackage.assets.filter((asset) => asset.role === "drill-preview").length}</li>
          </ul>
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

      {selectedPhase ? (
        <section className="card">
          <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Authoring warnings</h3>
          <ul style={{ margin: 0, paddingLeft: "1rem" }}>
            {selectedPhaseSourceImage && !selectedPhase.poseSequence[0] ? (
              <li className="muted">Source image exists but no canonical pose is applied yet.</li>
            ) : null}
            {!selectedPhaseSourceImage && selectedPhase.poseSequence[0] ? (
              <li className="muted">Canonical pose exists without a local source image reference for visual alignment.</li>
            ) : null}
            {selectedPhaseDetection.status === "failed" ? (
              <li className="muted">Image detection failed for this phase. Review image quality or remap manually.</li>
            ) : null}
            {!selectedPhaseSourceImage && !selectedPhase.poseSequence[0] ? (
              <li className="muted">No source image and no pose data available yet for this phase.</li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
