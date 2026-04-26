"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { useStudioState } from "@/components/studio/StudioState";
import { getSortedPhases } from "@/lib/editor/package-editor";

export function DetectionWorkflowPanel({
  phaseId,
  autoOpenSource
}: {
  phaseId: string;
  autoOpenSource?: "upload" | null;
}) {
  const {
    selectedPhaseSourceImage,
    selectedPhaseDetection,
    selectedPackage,
    selectedPhaseId,
    setSelectedPhaseImage,
    clearSelectedPhaseImage,
    runPoseDetectionForSelectedPhase,
    applyDetectionToSelectedPhase,
    clearSelectedPhasePoseReference
  } = useStudioState();

  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoOpenSource === "upload") {
      uploadInputRef.current?.click();
    }
  }, [autoOpenSource, phaseId]);

  const selectedPhase = selectedPackage
    ? getSortedPhases(selectedPackage.workingPackage).find((phase) => phase.phaseId === selectedPhaseId) ?? null
    : null;
  const hasPoseReference = Boolean(selectedPhase?.poseSequence[0]);
  const hasDetectedPose = selectedPhaseDetection.status === "detected" || selectedPhaseDetection.status === "applied";

  return (
    <section className="card" style={{ display: "grid", gap: "0.6rem" }}>
      <div className="studio-action-row">
        <label style={labelStyle}>
          <span>Source image</span>
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={inputStyle}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }

              await setSelectedPhaseImage(file);
              event.currentTarget.value = "";
            }}
          />
        </label>

        <button type="button" onClick={() => clearSelectedPhaseImage()} className="studio-button" disabled={!selectedPhaseSourceImage}>
          Clear source image
        </button>

        <button type="button" onClick={() => void runPoseDetectionForSelectedPhase()} className="studio-button" disabled={!selectedPhaseSourceImage}>
          {selectedPhaseDetection.status === "failed" ? "Retry detection" : "Detect pose"}
        </button>

        <button type="button" onClick={() => applyDetectionToSelectedPhase()} className="studio-button studio-button-primary" disabled={!hasDetectedPose}>
          Apply as pose reference
        </button>

        <button type="button" onClick={() => clearSelectedPhasePoseReference()} className="studio-button studio-button-danger" disabled={!hasPoseReference}>
          Clear pose reference
        </button>
      </div>

      <p className="muted" style={{ margin: 0 }}>
        {selectedPhaseDetection.message}
      </p>
      {hasPoseReference ? (
        <p className="muted" style={{ margin: 0 }}>
          Pose reference saved.
        </p>
      ) : null}
    </section>
  );
}

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
