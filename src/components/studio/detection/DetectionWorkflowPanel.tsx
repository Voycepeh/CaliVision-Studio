"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { useStudioState } from "@/components/studio/StudioState";

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
    setSelectedPhaseImage,
    clearSelectedPhaseImage,
    runPoseDetectionForSelectedPhase
  } = useStudioState();

  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoOpenSource === "upload") {
      uploadInputRef.current?.click();
    }
  }, [autoOpenSource, phaseId]);

  return (
    <section className="card" style={{ display: "grid", gap: "0.6rem" }}>
      <div className="studio-action-row">
        <label style={labelStyle}>
          <span>Upload image</span>
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
          Remove image
        </button>

        {selectedPhaseDetection.status === "failed" ? (
          <button type="button" onClick={() => runPoseDetectionForSelectedPhase()} className="studio-button studio-button-primary" disabled={!selectedPhaseSourceImage}>
            Retry detection
          </button>
        ) : null}
      </div>

      <p className="muted" style={{ margin: 0 }}>
        {selectedPhaseDetection.message}
      </p>
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
