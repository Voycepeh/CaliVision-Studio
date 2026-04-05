const mockPhases = [
  { id: "phase-1", title: "Setup Stance", durationSec: 8 },
  { id: "phase-2", title: "Primary Motion", durationSec: 16 },
  { id: "phase-3", title: "Recovery + Reset", durationSec: 10 }
];

export function WorkspacePanel() {
  return (
    <div style={{ padding: "1rem", height: "100%", display: "grid", gridTemplateRows: "auto auto 1fr" }}>
      <section style={{ marginBottom: "1rem" }}>
        <h2 style={{ margin: "0 0 0.35rem" }}>Drill Workspace</h2>
        <p style={{ margin: 0, color: "var(--muted)" }}>Metadata, phase authoring, and package-ready sequencing.</p>
      </section>

      <section style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginBottom: "0.35rem" }}>Metadata</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <Field label="Title" value="Reactive Defense Ladder" />
          <Field label="Difficulty" value="Intermediate" />
          <Field label="Category" value="Footwork" />
          <Field label="Version" value="0.1.0" />
        </div>
      </section>

      <section>
        <h3 style={{ marginBottom: "0.35rem" }}>Phases + Timeline Placeholder</h3>
        <div style={{ border: "1px solid var(--border)", borderRadius: "0.6rem", padding: "0.75rem" }}>
          {mockPhases.map((phase) => (
            <div
              key={phase.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "0.45rem 0",
                borderBottom: "1px solid var(--border)"
              }}
            >
              <span>{phase.title}</span>
              <span style={{ color: "var(--muted)" }}>{phase.durationSec}s</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div
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
  );
}
