"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useMemo } from "react";
import { mapDetectionResultToPortablePose } from "@/lib/detection";
import { mapPortablePoseToCanvasPoseModel } from "@/lib/package/mapping/canvas-view-models";
import { PoseCanvas } from "@/components/studio/canvas/PoseCanvas";
import { useStudioState } from "@/components/studio/StudioState";

export function DetectionWorkflowPanel({ phaseId }: { phaseId: string }) {
  const {
    selectedPhaseSourceImage,
    selectedPhaseDetection,
    setSelectedPhaseImage,
    clearSelectedPhaseImage,
    runPoseDetectionForSelectedPhase,
    applyDetectionToSelectedPhase
  } = useStudioState();

  const previewPoseModel = useMemo(() => {
    const detectionResult = selectedPhaseDetection.result;
    if (!detectionResult || detectionResult.status === "failed") {
      return null;
    }

    const previewPose = mapDetectionResultToPortablePose(detectionResult, {
      poseId: `${phaseId}_detected_preview`,
      view: "front"
    });

    return mapPortablePoseToCanvasPoseModel(previewPose);
  }, [phaseId, selectedPhaseDetection.result]);

  return (
    <section className="card" style={{ display: "grid", gap: "0.75rem" }}>
      <h3 style={{ marginTop: 0, marginBottom: 0, fontSize: "0.95rem" }}>Phase image detection</h3>
      <p className="muted" style={{ margin: 0 }}>
        Upload a phase image, run detection, review the preview, then apply it to the selected phase.
      </p>

      <label style={labelStyle}>
        <span>Upload phase image (local only)</span>
        <input
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

      {selectedPhaseSourceImage ? (
        <div style={{ display: "grid", gap: "0.35rem" }}>
          <Image
            src={selectedPhaseSourceImage.objectUrl}
            alt={`Phase source ${selectedPhaseSourceImage.fileName}`}
            width={selectedPhaseSourceImage.width || 640}
            height={selectedPhaseSourceImage.height || 360}
            unoptimized
            style={{ width: "100%", maxHeight: "220px", height: "auto", objectFit: "contain", borderRadius: "0.55rem", border: "1px solid var(--border)" }}
          />
          <p className="muted" style={{ margin: 0 }}>
            {selectedPhaseSourceImage.fileName} • {selectedPhaseSourceImage.width}×{selectedPhaseSourceImage.height} • {Math.round(selectedPhaseSourceImage.byteSize / 1024)}KB
          </p>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>No image selected for this phase yet.</p>
      )}

      <div className="studio-action-row">
        <button type="button" onClick={() => runPoseDetectionForSelectedPhase()} className="studio-button studio-button-primary" disabled={!selectedPhaseSourceImage || selectedPhaseDetection.status === "detecting"}>
          {selectedPhaseDetection.status === "detecting" ? "Detecting..." : "Detect pose"}
        </button>
        <button
          type="button"
          onClick={() => applyDetectionToSelectedPhase()}
          className="studio-button"
          disabled={!selectedPhaseDetection.result || selectedPhaseDetection.result.status === "failed"}
        >
          Apply pose to phase
        </button>
        <button type="button" onClick={() => clearSelectedPhaseImage()} className="studio-button studio-button-danger" disabled={!selectedPhaseSourceImage}>
          Clear image
        </button>
      </div>

      <p className="muted" style={{ margin: 0 }}>
        {selectedPhaseDetection.message}
      </p>

      {selectedPhaseDetection.result ? (
        <div className="card" style={{ display: "grid", gap: "0.45rem" }}>
          <p className="muted" style={{ margin: 0 }}>
            Coverage: {selectedPhaseDetection.result.coverage.detectedJoints}/{selectedPhaseDetection.result.coverage.totalCanonicalJoints} • Avg confidence: {selectedPhaseDetection.result.confidence.averageJointConfidence.toFixed(2)}
          </p>
          {selectedPhaseDetection.result.issues.length > 0 ? (
            <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
              {selectedPhaseDetection.result.issues.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>
                  [{issue.severity}] {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {previewPoseModel ? <PoseCanvas pose={previewPoseModel} title="Detection preview" subtitle="Review before applying to your drill" /> : null}
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
