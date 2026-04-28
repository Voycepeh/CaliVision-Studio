"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useStudioState } from "@/components/studio/StudioState";
import { clampDetectionCropToImage, computeDetectionCropRectPx } from "@/lib/detection";

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
    setSelectedPhaseImage,
    clearSelectedPhaseImage,
    runPoseDetectionForSelectedPhase,
    setSelectedPhaseDetectionCrop,
    resetSelectedPhaseDetectionCrop
  } = useStudioState();

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<{ pointerId: number; startX: number; startY: number; cropAtStartX: number; cropAtStartY: number } | null>(null);
  const pinchPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    if (autoOpenSource === "upload") {
      uploadInputRef.current?.click();
    }
  }, [autoOpenSource, phaseId]);

  const hasDetectedPose = selectedPhaseDetection.status === "detected" || selectedPhaseDetection.status === "applied";
  const cropRect = useMemo(
    () => selectedPhaseSourceImage
      ? computeDetectionCropRectPx(selectedPhaseSourceImage.width, selectedPhaseSourceImage.height, selectedPhaseDetectionCrop)
      : null,
    [selectedPhaseDetectionCrop, selectedPhaseSourceImage]
  );

  const workspaceGeometry = useMemo(() => {
    if (!selectedPhaseSourceImage || !cropRect) {
      return null;
    }

    const sourceAspect = selectedPhaseSourceImage.width / selectedPhaseSourceImage.height;
    const frameAspect = 1;
    const imageWidthNorm = sourceAspect >= frameAspect ? 1 : sourceAspect / frameAspect;
    const imageHeightNorm = sourceAspect >= frameAspect ? frameAspect / sourceAspect : 1;
    const imageXNorm = (1 - imageWidthNorm) / 2;
    const imageYNorm = (1 - imageHeightNorm) / 2;
    const cropXNorm = imageXNorm + (cropRect.sx / selectedPhaseSourceImage.width) * imageWidthNorm;
    const cropYNorm = imageYNorm + (cropRect.sy / selectedPhaseSourceImage.height) * imageHeightNorm;
    const cropSizeNorm = (cropRect.size / selectedPhaseSourceImage.width) * imageWidthNorm;

    return {
      imageXNorm,
      imageYNorm,
      imageWidthNorm,
      imageHeightNorm,
      cropXNorm,
      cropYNorm,
      cropSizeNorm
    };
  }, [cropRect, selectedPhaseSourceImage]);

  function updatePan(dx: number, dy: number): void {
    if (!selectedPhaseSourceImage) {
      return;
    }

    setSelectedPhaseDetectionCrop(
      clampDetectionCropToImage(selectedPhaseSourceImage.width, selectedPhaseSourceImage.height, {
        centerX: selectedPhaseDetectionCrop.centerX + dx,
        centerY: selectedPhaseDetectionCrop.centerY + dy,
        zoom: selectedPhaseDetectionCrop.zoom
      })
    );
  }

  function updateZoom(zoom: number): void {
    if (!selectedPhaseSourceImage) {
      return;
    }

    setSelectedPhaseDetectionCrop(
      clampDetectionCropToImage(selectedPhaseSourceImage.width, selectedPhaseSourceImage.height, {
        ...selectedPhaseDetectionCrop,
        zoom
      })
    );
  }

  return (
    <section className="card" style={{ display: "grid", gap: "0.6rem" }}>
      <h4 style={{ margin: 0, fontSize: "0.9rem" }}>A. Source image and detection crop</h4>
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

        <button type="button" onClick={() => clearSelectedPhaseImage()} className="studio-button studio-button-danger" disabled={!selectedPhaseSourceImage}>
          Clear source image
        </button>

        <button type="button" onClick={() => void runPoseDetectionForSelectedPhase()} className="studio-button studio-button-primary" disabled={!selectedPhaseSourceImage}>
          {selectedPhaseDetection.status === "failed" ? "Retry detection" : "Detect pose"}
        </button>
      </div>

      {selectedPhaseSourceImage ? (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <p className="muted" style={{ margin: 0 }}>
            This crop is only used for pose detection.
          </p>
          <div className="studio-detection-crop-layout">
            <div
              ref={workspaceRef}
              className="studio-detection-crop-workspace"
              style={workspaceStyle}
              onWheel={(event) => {
                event.preventDefault();
                const direction = event.deltaY < 0 ? 1 : -1;
                updateZoom(selectedPhaseDetectionCrop.zoom + direction * 0.1);
              }}
              onPointerDown={(event) => {
                if (!selectedPhaseSourceImage || !workspaceRef.current || !workspaceGeometry) {
                  return;
                }

                event.currentTarget.setPointerCapture(event.pointerId);
                pinchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

                if (pinchPointersRef.current.size === 1) {
                  setDragState({
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    cropAtStartX: selectedPhaseDetectionCrop.centerX,
                    cropAtStartY: selectedPhaseDetectionCrop.centerY
                  });
                } else if (pinchPointersRef.current.size === 2) {
                  const [first, second] = [...pinchPointersRef.current.values()];
                  const distance = Math.hypot(first.x - second.x, first.y - second.y);
                  pinchStateRef.current = { distance, zoom: selectedPhaseDetectionCrop.zoom };
                  setDragState(null);
                }
              }}
              onPointerMove={(event) => {
                if (!selectedPhaseSourceImage || !workspaceRef.current || !workspaceGeometry) {
                  return;
                }

                if (pinchPointersRef.current.has(event.pointerId)) {
                  pinchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                }

                if (pinchPointersRef.current.size === 2) {
                  const [first, second] = [...pinchPointersRef.current.values()];
                  const currentDistance = Math.hypot(first.x - second.x, first.y - second.y);
                  const pinchState = pinchStateRef.current;
                  if (pinchState && pinchState.distance > 0) {
                    const zoomScale = currentDistance / pinchState.distance;
                    updateZoom(pinchState.zoom * zoomScale);
                  }
                  return;
                }

                if (!dragState || dragState.pointerId !== event.pointerId) {
                  return;
                }

                const dxPx = event.clientX - dragState.startX;
                const dyPx = event.clientY - dragState.startY;
                const centerX = dragState.cropAtStartX + dxPx / workspaceRef.current.clientWidth / workspaceGeometry.imageWidthNorm;
                const centerY = dragState.cropAtStartY + dyPx / workspaceRef.current.clientHeight / workspaceGeometry.imageHeightNorm;
                setSelectedPhaseDetectionCrop(
                  clampDetectionCropToImage(selectedPhaseSourceImage.width, selectedPhaseSourceImage.height, {
                    ...selectedPhaseDetectionCrop,
                    centerX,
                    centerY
                  })
                );
              }}
              onPointerUp={(event) => {
                pinchPointersRef.current.delete(event.pointerId);
                if (dragState?.pointerId === event.pointerId) {
                  setDragState(null);
                }
                if (pinchPointersRef.current.size < 2) {
                  pinchStateRef.current = null;
                }
              }}
              onPointerCancel={(event) => {
                pinchPointersRef.current.delete(event.pointerId);
                if (dragState?.pointerId === event.pointerId) {
                  setDragState(null);
                }
                if (pinchPointersRef.current.size < 2) {
                  pinchStateRef.current = null;
                }
              }}
            >
              <img
                src={selectedPhaseSourceImage.objectUrl}
                alt="Phase source"
                draggable={false}
                style={{
                  position: "absolute",
                  left: `${(workspaceGeometry?.imageXNorm ?? 0) * 100}%`,
                  top: `${(workspaceGeometry?.imageYNorm ?? 0) * 100}%`,
                  width: `${(workspaceGeometry?.imageWidthNorm ?? 1) * 100}%`,
                  height: `${(workspaceGeometry?.imageHeightNorm ?? 1) * 100}%`,
                  objectFit: "fill",
                  opacity: 0.95,
                  userSelect: "none",
                  touchAction: "none"
                }}
              />
              {workspaceGeometry ? (
                <>
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: `${workspaceGeometry.cropXNorm * 100}%`,
                      top: `${workspaceGeometry.cropYNorm * 100}%`,
                      width: `${workspaceGeometry.cropSizeNorm * 100}%`,
                      height: `${workspaceGeometry.cropSizeNorm * 100}%`,
                      border: "2px solid rgba(114, 168, 255, 0.95)",
                      borderRadius: "0.35rem",
                      boxShadow: "0 0 0 9999px rgba(8,11,17,0.45), 0 0 0 1px rgba(8,11,17,0.65)"
                    }}
                  />
                </>
              ) : null}
            </div>
            <div className="studio-detection-crop-controls" style={{ display: "grid", gap: "0.35rem" }}>
              <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                Drag to position the square crop. Use mouse wheel or pinch to zoom.
              </p>
              <div className="studio-action-row">
                <button type="button" className="studio-button" onClick={() => updateZoom(selectedPhaseDetectionCrop.zoom + ZOOM_STEP)}>Zoom in</button>
                <button type="button" className="studio-button" onClick={() => updateZoom(selectedPhaseDetectionCrop.zoom - ZOOM_STEP)}>Zoom out</button>
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
      {hasDetectedPose ? <p className="muted" style={{ margin: 0 }}>Detected pose is ready for the square pose editor.</p> : null}
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
  width: "100%",
  maxWidth: "340px",
  aspectRatio: "1 / 1",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  overflow: "hidden",
  background: "var(--panel-soft)",
  position: "relative",
  touchAction: "none",
  cursor: "grab"
};
