const sections = {
  Library: ["Warmup Set A", "Footwork Combo B", "Defense Ladder C"],
  Assets: ["Pose Set: Intro", "Audio Cue Pack", "Overlay: Angles"],
  Packages: ["Starter Pack v0.1", "Coach Demo v0.2"]
};

export function LibraryPanel() {
  return (
    <div style={{ padding: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Studio Sources</h2>
      {Object.entries(sections).map(([section, items]) => (
        <section key={section} style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ marginBottom: "0.4rem", color: "var(--muted)", fontSize: "0.9rem" }}>{section}</h3>
          <ul style={{ margin: 0, paddingLeft: "1rem" }}>
            {items.map((item) => (
              <li key={item} style={{ marginBottom: "0.3rem" }}>
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
