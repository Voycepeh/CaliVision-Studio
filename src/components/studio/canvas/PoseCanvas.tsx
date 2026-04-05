import type { CanvasPoseModel } from "@/lib/package/mapping/canvas-view-models";

type PoseCanvasProps = {
  pose: CanvasPoseModel;
  title?: string;
  subtitle?: string;
  selected?: boolean;
};

export function PoseCanvas({ pose, title = "Phase pose preview", subtitle, selected = false }: PoseCanvasProps) {
  const { canvas, joints, connections } = pose;

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
          width="100%"
          viewBox={`0 0 ${canvas.widthRef} ${canvas.heightRef}`}
          style={{ display: "block", aspectRatio: `${canvas.widthRef} / ${canvas.heightRef}` }}
          role="img"
          aria-label="Canonical pose canvas"
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

          {joints.map((joint) => (
            <circle
              key={joint.name}
              cx={joint.pixel.x}
              cy={joint.pixel.y}
              r={10}
              fill={joint.outOfBounds ? "#f0b47d" : "#86b6ff"}
              stroke="rgba(7,11,17,0.95)"
              strokeWidth={3}
            />
          ))}

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
