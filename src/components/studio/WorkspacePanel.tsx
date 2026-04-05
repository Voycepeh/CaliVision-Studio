const mockPhases = [
  { id: "phase-1", order: 1, title: "Setup stance", durationSec: 8, status: "Ready" },
  { id: "phase-2", order: 2, title: "Primary movement", durationSec: 16, status: "Needs pose refinement" },
  { id: "phase-3", order: 3, title: "Recovery + reset", durationSec: 10, status: "Ready" }
];

export function WorkspacePanel() {
  return (
    <div className="panel-content" style={{ display: "grid", gap: "0.8rem", alignContent: "start" }}>
      <header>
        <h2 style={{ marginTop: 0, marginBottom: "0.4rem" }}>Drill Workspace</h2>
        <p className="muted" style={{ margin: 0 }}>
          Author drill metadata, phase flow, and package readiness from one central timeline.
        </p>
      </header>

      <section className="card">
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Drill metadata</h3>
        <div className="field-grid">
          <Field label="Title" value="Reactive Defense Ladder" />
          <Field label="Difficulty" value="Intermediate" />
          <Field label="Primary View" value="Side" />
          <Field label="Schema version" value="0.1.0" />
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Phase list</h3>
        <div style={{ display: "grid", gap: "0.35rem" }}>
          {mockPhases.map((phase) => (
            <article
              key={phase.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "0.65rem",
                padding: "0.55rem",
                background: "var(--panel-soft)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <strong>
                  {phase.order}. {phase.title}
                </strong>
                <span className="muted">{phase.durationSec}s</span>
              </div>
              <small className="muted">{phase.status}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Selected phase detail</h3>
        <p className="muted" style={{ margin: 0 }}>
          Phase 2 selected. Placeholder controls for timing, pose keyframes, and asset assignment.
        </p>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Timeline / sequence area</h3>
        <p className="muted" style={{ margin: 0 }}>
          Horizontal timeline placeholder. Future PR will add keyframe handles and snapping logic.
        </p>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Notes / validation summary</h3>
        <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
          <li>All phases have explicit order values.</li>
          <li>One phase has missing confidence on several joints.</li>
          <li>No blocking schema errors in mock package.</li>
        </ul>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "0.65rem",
        padding: "0.55rem 0.65rem",
        background: "var(--panel-soft)"
      }}
    >
      <small style={{ display: "block", color: "var(--muted)" }}>{label}</small>
      <span>{value}</span>
    </div>
  );
}
