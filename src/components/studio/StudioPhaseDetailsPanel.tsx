"use client";

import { useMemo } from "react";
import { useStudioState } from "@/components/studio/StudioState";
import { getSortedPhases } from "@/lib/editor/package-editor";
import { formatDurationShort } from "@/lib/format/duration";

export function StudioPhaseDetailsPanel() {
  const { selectedPackage, selectedPhaseId, selectedPhaseSourceImage, selectedPhaseDetection } = useStudioState();

  const selectedPhase = useMemo(() => {
    if (!selectedPackage) {
      return null;
    }

    return getSortedPhases(selectedPackage.workingPackage).find((phase) => phase.phaseId === selectedPhaseId) ?? null;
  }, [selectedPackage, selectedPhaseId]);

  return (
    <section>
      <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Phase details</h3>
      {selectedPhase ? (
        <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
          <li>Phase ID: {selectedPhase.phaseId}</li>
          <li>Order: {selectedPhase.order}</li>
          <li>Duration: {formatDurationShort(selectedPhase.durationMs)}</li>
          <li>Pose frames: {selectedPhase.poseSequence.length}</li>
          <li>Assets: {selectedPhase.assetRefs.length}</li>
          <li>
            Packaged source image: {selectedPhase.assetRefs.some((asset) => asset.role === "phase-source-image") ? "yes" : "no"}
          </li>
          <li>
            Editor source image: {selectedPhaseSourceImage ? `${selectedPhaseSourceImage.origin} (${selectedPhaseSourceImage.fileName})` : "none"}
          </li>
          <li>Detection workflow: {selectedPhaseDetection.status}</li>
        </ul>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Select a phase to see details.
        </p>
      )}
    </section>
  );
}
