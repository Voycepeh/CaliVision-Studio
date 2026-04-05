const sections: Array<{ title: string; items: string[] }> = [
  { title: "Drills", items: ["Reactive Defense Ladder", "Flow Warmup Sequence", "Balance Recovery Drill"] },
  { title: "Assets", items: ["Front stance image", "Coach voice-over clip", "Overlay reference lines"] },
  { title: "Packages", items: ["Starter mobility pack", "Coach onboarding set"] },
  { title: "Recent", items: ["Edited 30m ago", "Imported sample package", "Validation notes"] },
  { title: "Marketplace", items: ["Placeholder only in PR1"] }
];

export function LibraryPanel() {
  return (
    <div className="panel-content">
      <h2 style={{ marginTop: 0 }}>Library & Sources</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Organize source drills, package drafts, and assets used by the Studio workspace.
      </p>

      <div style={{ display: "grid", gap: "0.8rem" }}>
        {sections.map((section) => (
          <section key={section.title} className="card">
            <h3 style={{ marginTop: 0, marginBottom: "0.35rem", fontSize: "0.95rem" }}>{section.title}</h3>
            <ul style={{ margin: 0, paddingLeft: "1rem", color: "var(--muted)" }}>
              {section.items.map((item) => (
                <li key={item} style={{ marginBottom: "0.25rem" }}>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
