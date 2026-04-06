"use client";

import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { canvasToNormalizedPoint, normalizedToCanvasPoint } from "@/lib/canvas/mapping";
import type { CanvasPoseModel } from "@/lib/package/mapping/canvas-view-models";
import { getAuthoringJointLabel } from "@/lib/pose/canonical";
import {
  getPreviewJointRole,
  PREVIEW_OVERLAY_STYLE
} from "@/lib/pose/preview-overlay";
import type { CanonicalJointName } from "@/lib/schema/contracts";

type PoseCanvasProps = {
  pose: CanvasPoseModel;
  title?: string;
  subtitle?: string;
  selected?: boolean;
  editable?: boolean;
  selectedJointName?: CanonicalJointName | null;
  focusJointNames?: Set<CanonicalJointName> | null;
  onJointSelect?: (joint: CanonicalJointName) => void;
  onJointMove?: (joint: CanonicalJointName, x: number, y: number) => void;
  imageLayer?: {
    src: string;
    naturalWidth: number;
    naturalHeight: number;
    opacity: number;
    fitMode: "contain" | "cover";
    offsetX: number;
    offsetY: number;
  } | null;
  showPoseLayer?: boolean;
  imageErrorMessage?: string | null;
  sizeMode?: "default" | "balanced" | "focus";
};

export function PoseCanvas({
  pose,
  title = "Phase pose preview",
  subtitle,
  selected = false,
  editable = false,
  selectedJointName = null,
  focusJointNames = null,
  onJointSelect,
  onJointMove,
  imageLayer = null,
  showPoseLayer = true,
  imageErrorMessage = null,
  sizeMode = "default"
}: PoseCanvasProps) {
  const { canvas, joints, connections } = pose;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragJoint, setDragJoint] = useState<CanonicalJointName | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);

  function pointerToNormalized(event: ReactPointerEvent<SVGSVGElement>) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) {
      return null;
    }

    const rawX = ((event.clientX - box.left) / box.width) * canvas.widthRef;
    const rawY = ((event.clientY - box.top) / box.height) * canvas.heightRef;
    return canvasToNormalizedPoint({ x: rawX, y: rawY }, canvas, { clamp: true });
  }

  function onCanvasPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!dragJoint) {
      return;
    }

    const normalized = pointerToNormalized(event);
    if (!normalized) {
      return;
    }

    setDragPosition(normalized);
  }

  function onCanvasPointerUp() {
    if (dragJoint && dragPosition && onJointMove) {
      onJointMove(dragJoint, dragPosition.x, dragPosition.y);
    }

    setDragJoint(null);
    setDragPosition(null);
  }

  const displayJoints = useMemo(() => {
    if (!dragJoint || !dragPosition) {
      return joints;
    }

    return joints.map((joint) => {
      if (joint.name !== dragJoint) {
        return joint;
      }

      return {
        ...joint,
        normalized: dragPosition,
        pixel: normalizedToCanvasPoint(dragPosition, canvas, { clamp: true }),
        outOfBounds: false
      };
    });
  }, [joints, dragJoint, dragPosition, canvas]);

  const selectedJoint = useMemo(
    () => displayJoints.find((joint) => joint.name === selectedJointName) ?? null,
    [displayJoints, selectedJointName]
  );
  const byName = useMemo(() => new Map(displayJoints.map((joint) => [joint.name, joint])), [displayJoints]);
  const displayConnections = useMemo(
    () =>
      connections.flatMap((segment) => {
        const from = byName.get(segment.from.name);
        const to = byName.get(segment.to.name);

        if (!from || !to) {
          return [];
        }

        return [{ from, to }];
      }),
    [connections, byName]
  );
  const imagePlacement = useMemo(() => {
    if (!imageLayer || imageLayer.naturalWidth <= 0 || imageLayer.naturalHeight <= 0) {
      return null;
    }

    const widthScale = canvas.widthRef / imageLayer.naturalWidth;
    const heightScale = canvas.heightRef / imageLayer.naturalHeight;
    const scale = imageLayer.fitMode === "cover" ? Math.max(widthScale, heightScale) : Math.min(widthScale, heightScale);
    const imageWidth = imageLayer.naturalWidth * scale;
    const imageHeight = imageLayer.naturalHeight * scale;

    return {
      x: (canvas.widthRef - imageWidth) / 2 + imageLayer.offsetX * canvas.widthRef,
      y: (canvas.heightRef - imageHeight) / 2 + imageLayer.offsetY * canvas.heightRef,
      width: imageWidth,
      height: imageHeight
    };
  }, [imageLayer, canvas.heightRef, canvas.widthRef]);

  return (
    <section className="card" style={{ padding: "0.65rem" }}>
      <header className="pose-canvas-header" style={{ marginBottom: "0.5rem" }}>
        <h3 className="pose-canvas-title" style={{ margin: 0, fontSize: "0.95rem" }}>
          {title}
        </h3>
        {subtitle ? (
          <p className="muted pose-canvas-subtitle" style={{ margin: "0.2rem 0 0" }}>
            {subtitle}
          </p>
        ) : null}
      </header>

      <div
        className={`pose-canvas-frame pose-canvas-frame-${sizeMode}`}
        style={{
          border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "0.65rem",
          overflow: "hidden",
          background:
            "linear-gradient(180deg, rgba(15, 21, 31, 0.98) 0%, rgba(12, 18, 28, 0.95) 100%), radial-gradient(circle at top, rgba(114,168,255,0.15), transparent 48%)"
        }}
      >
        <svg
          ref={svgRef}
          className="pose-canvas-svg"
          viewBox={`0 0 ${canvas.widthRef} ${canvas.heightRef}`}
          style={{ display: "block", aspectRatio: `${canvas.widthRef} / ${canvas.heightRef}`, width: "100%", height: "auto" }}
          role="img"
          aria-label="Canonical pose canvas"
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerLeave={onCanvasPointerUp}
        >
          <Grid width={canvas.widthRef} height={canvas.heightRef} />

          {imageLayer && imagePlacement ? (
            <image
              href={imageLayer.src}
              x={imagePlacement.x}
              y={imagePlacement.y}
              width={imagePlacement.width}
              height={imagePlacement.height}
              opacity={imageLayer.opacity}
            />
          ) : null}

          {showPoseLayer
            ? displayConnections.map((segment) => (
                <line
                  key={`${segment.from.name}-${segment.to.name}`}
                  x1={segment.from.pixel.x}
                  y1={segment.from.pixel.y}
                  x2={segment.to.pixel.x}
                  y2={segment.to.pixel.y}
                  stroke={PREVIEW_OVERLAY_STYLE.skeletonBase}
                  strokeWidth={PREVIEW_OVERLAY_STYLE.skeletonStrokeWidth}
                  strokeLinecap="round"
                  opacity={focusJointNames && (!focusJointNames.has(segment.from.name) || !focusJointNames.has(segment.to.name)) ? 0.22 : 1}
                />
              ))
            : null}

          {showPoseLayer
            ? displayJoints.map((joint) => {
            const isSelected = joint.name === selectedJointName;
            const role = getPreviewJointRole(joint.name);
            const baseRadius = PREVIEW_OVERLAY_STYLE.jointRadiusBase;
            const largeRadius = baseRadius * PREVIEW_OVERLAY_STYLE.jointRadiusLargeMultiplier;
            const isLargeJoint = role === "nose" || role === "hip";
            const jointRadius = isLargeJoint ? largeRadius : baseRadius;
            const jointFill =
              role === "nose"
                ? PREVIEW_OVERLAY_STYLE.nose
                : role === "hip"
                  ? PREVIEW_OVERLAY_STYLE.hip
                  : PREVIEW_OVERLAY_STYLE.skeletonBase;

                return (
                  <circle
                    key={joint.name}
                    cx={joint.pixel.x}
                    cy={joint.pixel.y}
                    r={isSelected ? jointRadius + 3 : jointRadius}
                    fill={joint.outOfBounds ? "#f0b47d" : jointFill}
                    stroke={isSelected ? "#f7fbff" : "rgba(7,11,17,0.95)"}
                    strokeWidth={isSelected ? 4 : 3}
                    opacity={focusJointNames && !focusJointNames.has(joint.name) ? 0.28 : 1}
                    style={{ cursor: editable ? "grab" : "default" }}
                    onPointerDown={(event) => {
                      if (!editable) {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();
                      setDragJoint(joint.name);
                      onJointSelect?.(joint.name);
                    }}
                    onClick={(event) => {
                      if (!editable) {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();
                      onJointSelect?.(joint.name);
                    }}
                  />
                );
              })
            : null}

          {selectedJoint && showPoseLayer ? (
            <text x={selectedJoint.pixel.x + 16} y={selectedJoint.pixel.y - 14} fill="rgba(215,228,245,0.95)" style={{ fontSize: 40 }}>
              {getAuthoringJointLabel(selectedJoint.name)}
            </text>
          ) : null}

          {imageErrorMessage ? <CanvasMessage text={imageErrorMessage} /> : null}
          {pose.status === "empty" && showPoseLayer ? <CanvasMessage text="No pose data for selected phase yet." /> : null}
          {pose.status === "invalid" && showPoseLayer ? <CanvasMessage text="Pose data is invalid or missing canonical joints." /> : null}
          {!showPoseLayer && !imageLayer ? <CanvasMessage text="Enable image or pose layer to begin visual authoring." /> : null}
        </svg>
      </div>
    </section>
  );
}

function Grid({ width, height }: { width: number; height: number }) {
  const cols = 4;
  const rows = 8;

  return (
    <>
      <rect x={0} y={0} width={width} height={height} fill="rgba(8, 12, 19, 0.85)" />
      {Array.from({ length: cols - 1 }).map((_, index) => {
        const x = ((index + 1) * width) / cols;
        return (
          <line
            key={`col-${x}`}
            x1={x}
            y1={0}
            x2={x}
            y2={height}
            stroke={PREVIEW_OVERLAY_STYLE.idealLine}
            strokeWidth={PREVIEW_OVERLAY_STYLE.idealLineStrokeWidth}
          />
        );
      })}
      {Array.from({ length: rows - 1 }).map((_, index) => {
        const y = ((index + 1) * height) / rows;
        return (
          <line
            key={`row-${y}`}
            x1={0}
            y1={y}
            x2={width}
            y2={y}
            stroke={PREVIEW_OVERLAY_STYLE.idealLine}
            strokeWidth={PREVIEW_OVERLAY_STYLE.idealLineStrokeWidth}
          />
        );
      })}
      <rect
        x={2}
        y={2}
        width={width - 4}
        height={height - 4}
        fill="none"
        stroke={PREVIEW_OVERLAY_STYLE.idealLine}
        strokeWidth={PREVIEW_OVERLAY_STYLE.idealLineStrokeWidth}
      />
    </>
  );
}

function CanvasMessage({ text }: { text: string }) {
  return (
    <text
      x="50%"
      y="50%"
      textAnchor="middle"
      dominantBaseline="middle"
      fill="rgba(173, 189, 207, 0.9)"
      style={{ fontSize: 48, fontWeight: 500 }}
    >
      {text}
    </text>
  );
}
