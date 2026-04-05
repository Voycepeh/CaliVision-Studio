"use client";

import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { canvasToNormalizedPoint } from "@/lib/canvas/mapping";
import type { CanvasPoseModel } from "@/lib/package/mapping/canvas-view-models";
import type { CanonicalJointName } from "@/lib/schema/contracts";

type PoseCanvasProps = {
  pose: CanvasPoseModel;
  title?: string;
  subtitle?: string;
  selected?: boolean;
  editable?: boolean;
  selectedJointName?: CanonicalJointName | null;
  onJointSelect?: (joint: CanonicalJointName) => void;
  onJointMove?: (joint: CanonicalJointName, x: number, y: number) => void;
};

export function PoseCanvas({
  pose,
  title = "Phase pose preview",
  subtitle,
  selected = false,
  editable = false,
  selectedJointName = null,
  onJointSelect,
  onJointMove
}: PoseCanvasProps) {
  const { canvas, joints, connections } = pose;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragJoint, setDragJoint] = useState<CanonicalJointName | null>(null);

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
    if (!dragJoint || !onJointMove) {
      return;
    }

    const normalized = pointerToNormalized(event);
    if (!normalized) {
      return;
    }

    onJointMove(dragJoint, normalized.x, normalized.y);
  }

  function onCanvasPointerUp() {
    setDragJoint(null);
  }

  const selectedJoint = useMemo(() => joints.find((joint) => joint.name === selectedJointName) ?? null, [joints, selectedJointName]);

  return (
    <section className="card" style={{ padding: "0.65rem" }}>
      <header style={{ marginBottom: "0.5rem" }}>
        <h3 style={{ margin: 0, fontSize: "0.95rem" }}>{title}</h3>
        {subtitle ? (
          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
            {subtitle}
          </p>
        ) : null}
      </header>

      <div
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
          width="100%"
          viewBox={`0 0 ${canvas.widthRef} ${canvas.heightRef}`}
          style={{ display: "block", aspectRatio: `${canvas.widthRef} / ${canvas.heightRef}` }}
          role="img"
          aria-label="Canonical pose canvas"
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerLeave={onCanvasPointerUp}
        >
          <Grid width={canvas.widthRef} height={canvas.heightRef} />

          {connections.map((segment) => (
            <line
              key={`${segment.from.name}-${segment.to.name}`}
              x1={segment.from.pixel.x}
              y1={segment.from.pixel.y}
              x2={segment.to.pixel.x}
              y2={segment.to.pixel.y}
              stroke="rgba(146, 173, 207, 0.82)"
              strokeWidth={6}
              strokeLinecap="round"
            />
          ))}

          {joints.map((joint) => {
            const isSelected = joint.name === selectedJointName;

            return (
              <circle
                key={joint.name}
                cx={joint.pixel.x}
                cy={joint.pixel.y}
                r={isSelected ? 13 : 10}
                fill={joint.outOfBounds ? "#f0b47d" : isSelected ? "#9ad0ff" : "#86b6ff"}
                stroke={isSelected ? "#f7fbff" : "rgba(7,11,17,0.95)"}
                strokeWidth={isSelected ? 4 : 3}
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
          })}

          {selectedJoint ? (
            <text x={selectedJoint.pixel.x + 16} y={selectedJoint.pixel.y - 14} fill="rgba(215,228,245,0.95)" style={{ fontSize: 40 }}>
              {selectedJoint.name}
            </text>
          ) : null}

          {pose.status === "empty" ? <CanvasMessage text="No pose data for selected phase yet." /> : null}
          {pose.status === "invalid" ? <CanvasMessage text="Pose data is invalid or missing canonical joints." /> : null}
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
        return <line key={`col-${x}`} x1={x} y1={0} x2={x} y2={height} stroke="rgba(119, 139, 164, 0.15)" strokeWidth={2} />;
      })}
      {Array.from({ length: rows - 1 }).map((_, index) => {
        const y = ((index + 1) * height) / rows;
        return <line key={`row-${y}`} x1={0} y1={y} x2={width} y2={y} stroke="rgba(119, 139, 164, 0.15)" strokeWidth={2} />;
      })}
      <rect x={2} y={2} width={width - 4} height={height - 4} fill="none" stroke="rgba(126, 149, 177, 0.45)" strokeWidth={2} />
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
