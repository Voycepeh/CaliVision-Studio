const inspectorSections = [
  { title: "Pose canvas", description: "Editable 2D normalized pose canvas placeholder." },
  { title: "Source image preview", description: "Reference still for tracing and joint alignment." },
  { title: "Animation preview", description: "Playback panel placeholder for phase sequence." },
  { title: "Validation / errors", description: "Schema and semantic checks appear here." },
  { title: "Quick actions", description: "Duplicate phase, normalize joints, attach asset (placeholder)." }
];

export function InspectorPanel() {
  return (
    <div className="panel-content">
      <h2 style={{ marginTop: 0 }}>Inspector & Preview</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Right-side tools for visual editing, media preview, and package validation.
      </p>

      <div style={{ display: "grid", gap: "0.7rem" }}>
        {inspectorSections.map((section) => (
          <section key={section.title} className="card" style={{ minHeight: "92px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>{section.title}</h3>
            <p className="muted" style={{ margin: 0 }}>
              {section.description}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
