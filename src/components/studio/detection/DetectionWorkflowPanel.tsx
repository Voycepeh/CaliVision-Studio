"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import { useStudioState } from "@/components/studio/StudioState";
import { computeDetectionCropRectPx } from "@/lib/detection";
import { getSortedPhases } from "@/lib/editor/package-editor";

const PAN_STEP = 0.05;
const ZOOM_STEP = 0.2;

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
    selectedPhaseDetectionCrop,
    selectedPackage,
    selectedPhaseId,
    setSelectedPhaseImage,
    clearSelectedPhaseImage,
    runPoseDetectionForSelectedPhase,
    applyDetectionToSelectedPhase,
    clearSelectedPhasePoseReference,
    setSelectedPhaseDetectionCrop,
    resetSelectedPhaseDetectionCrop
  } = useStudioState();

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
  const cropRect = useMemo(
    () => selectedPhaseSourceImage
      ? computeDetectionCropRectPx(selectedPhaseSourceImage.width, selectedPhaseSourceImage.height, selectedPhaseDetectionCrop)
      : null,
    [selectedPhaseDetectionCrop, selectedPhaseSourceImage]
  );

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !selectedPhaseSourceImage || !cropRect) {
      return;
    }

    const image = new Image();
    image.onload = () => {
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = 300;
      canvas.height = 300;
      context.clearRect(0, 0, 300, 300);
      context.drawImage(image, cropRect.sx, cropRect.sy, cropRect.size, cropRect.size, 0, 0, 300, 300);
    };
    image.src = selectedPhaseSourceImage.objectUrl;
  }, [cropRect, selectedPhaseSourceImage]);

  function updatePan(dx: number, dy: number): void {
    setSelectedPhaseDetectionCrop({
      centerX: selectedPhaseDetectionCrop.centerX + dx,
      centerY: selectedPhaseDetectionCrop.centerY + dy
    });
  }

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

      {selectedPhaseSourceImage ? (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <p className="muted" style={{ margin: 0 }}>
            Use the square detection crop to isolate the athlete; tighter framing with less background clutter can improve pose detection.
          </p>
          <div style={{ display: "grid", gap: "0.4rem", gridTemplateColumns: "300px auto", alignItems: "start" }}>
            <div style={workspaceStyle}>
              <canvas ref={previewCanvasRef} style={{ width: "300px", height: "300px", display: "block" }} />
            </div>
            <div style={{ display: "grid", gap: "0.35rem" }}>
              <div className="studio-action-row">
                <button type="button" className="studio-button" onClick={() => setSelectedPhaseDetectionCrop({ zoom: selectedPhaseDetectionCrop.zoom + ZOOM_STEP })}>Zoom in</button>
                <button type="button" className="studio-button" onClick={() => setSelectedPhaseDetectionCrop({ zoom: selectedPhaseDetectionCrop.zoom - ZOOM_STEP })}>Zoom out</button>
                <button type="button" className="studio-button" onClick={() => resetSelectedPhaseDetectionCrop()}>Reset crop</button>
              </div>
              <div className="studio-action-row">
                <button type="button" className="studio-button" onClick={() => updatePan(-PAN_STEP, 0)}>Pan left</button>
                <button type="button" className="studio-button" onClick={() => updatePan(PAN_STEP, 0)}>Pan right</button>
                <button type="button" className="studio-button" onClick={() => updatePan(0, -PAN_STEP)}>Pan up</button>
                <button type="button" className="studio-button" onClick={() => updatePan(0, PAN_STEP)}>Pan down</button>
              </div>
              {cropRect ? (
                <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                  Detection crop: {Math.round(cropRect.size)}px square from a {selectedPhaseSourceImage.width}×{selectedPhaseSourceImage.height} source.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

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

const workspaceStyle: CSSProperties = {
  width: "300px",
  aspectRatio: "1 / 1",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  overflow: "hidden",
  background: "var(--panel-soft)"
};
