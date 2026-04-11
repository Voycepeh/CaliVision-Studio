"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mapDetectionResultToPortablePose } from "@/lib/detection";
import { mapPortablePoseToCanvasPoseModel } from "@/lib/package/mapping/canvas-view-models";
import { PoseCanvas } from "@/components/studio/canvas/PoseCanvas";
import { useStudioState } from "@/components/studio/StudioState";

export function DetectionWorkflowPanel({
  phaseId,
  autoOpenSource,
  entryMode = "upload",
  onEntryModeChange = () => {}
}: {
  phaseId: string;
  autoOpenSource?: "upload" | "camera" | null;
  entryMode?: "upload" | "camera";
  onEntryModeChange?: (mode: "upload" | "camera") => void;
}) {
  const {
    selectedPhaseSourceImage,
    selectedPhaseDetection,
    setSelectedPhaseImage,
    clearSelectedPhaseImage,
    runPoseDetectionForSelectedPhase,
    applyDetectionToSelectedPhase
  } = useStudioState();
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraStatus, setCameraStatus] = useState<"idle" | "starting" | "live" | "error">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const stopCameraStream = useCallback(() => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setCameraStatus("idle");
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
  }, [cameraStream]);

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

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoOpenSource === "upload") {
      uploadInputRef.current?.click();
    }
    if (autoOpenSource === "camera") {
      cameraInputRef.current?.click();
    }
  }, [autoOpenSource, phaseId]);

  return (
    <section className="card" style={{ display: "grid", gap: "0.75rem" }}>
      <h3 style={{ marginTop: 0, marginBottom: 0, fontSize: "0.95rem" }}>Phase image detection</h3>
      <p className="muted" style={{ margin: 0 }}>
        Upload a phase image, run detection, review the preview, then apply it to the selected phase.
      </p>

      <label style={labelStyle}>
        <span>Upload phase image (local only)</span>
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
      <div className="studio-action-row">
        <button type="button" className={`studio-button ${entryMode === "upload" ? "studio-button-primary" : ""}`} onClick={() => onEntryModeChange("upload")}>Upload image</button>
        <button type="button" className={`studio-button ${entryMode === "camera" ? "studio-button-primary" : ""}`} onClick={() => onEntryModeChange("camera")}>Use camera</button>
      </div>

      {entryMode === "upload" ? (
        <>
          <label style={labelStyle}>
            <span>Upload phase image (local only)</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={inputStyle}
              onChange={async (event) => {
                await handleSelectedFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <label style={labelStyle}>
            <span>Mobile camera fallback (capture via file picker)</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={inputStyle}
              onChange={async (event) => {
                await handleSelectedFile(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </>
      ) : (
        <div style={{ display: "grid", gap: "0.45rem" }}>
          <div className="studio-action-row">
            <button type="button" className="studio-button" onClick={() => startCamera()} disabled={cameraStatus === "starting"}>
              {cameraStatus === "starting" ? "Starting camera..." : "Start camera"}
            </button>
            <button type="button" className="studio-button studio-button-primary" onClick={() => captureFromVideo()} disabled={cameraStatus !== "live"}>
              Capture image
            </button>
          </div>
          <video ref={cameraVideoRef} playsInline muted autoPlay style={{ width: "100%", maxHeight: "220px", objectFit: "cover", borderRadius: "0.55rem", border: "1px solid var(--border)", background: "#101010" }} />
          {cameraError ? <p className="muted" style={{ margin: 0 }}>{cameraError}</p> : null}
        </div>
      )}

      <label style={labelStyle}>
        <span>Use camera (mobile/browser support)</span>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
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

      <label style={labelStyle}>
        <span>Use camera (mobile/browser support)</span>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
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
