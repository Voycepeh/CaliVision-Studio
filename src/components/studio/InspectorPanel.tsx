const inspectorRows = [
  ["Selected Node", "phase-2 / Primary Motion"],
  ["Pose Canvas", "Placeholder only (PR2)"],
  ["Preview", "Static scrub preview (PR3)"],
  ["Validation", "Package checks pending"]
];

export function InspectorPanel() {
  return (
    <div style={{ padding: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Inspector + Preview</h2>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        {inspectorRows.map(([label, value]) => (
          <div
            key={label}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "0.55rem",
              padding: "0.55rem 0.6rem",
              background: "var(--panel-elevated)"
            }}
          >
            <small style={{ display: "block", color: "var(--muted)" }}>{label}</small>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
