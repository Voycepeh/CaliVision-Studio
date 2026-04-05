export function TopBar() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--border)",
        padding: "0.9rem 1rem",
        background: "var(--panel)"
      }}
    >
      <div>
        <strong>CaliVision Studio</strong>
        <p style={{ margin: "0.2rem 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>
          Web-first drill authoring source of truth
        </p>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <span style={{ color: "var(--success)", fontSize: "0.85rem" }}>Saved (mock)</span>
        {[
          "Import",
          "Export",
          "Publish"
        ].map((action) => (
          <button
            key={action}
            type="button"
            style={{
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              background: "var(--panel-elevated)",
              color: "var(--text)",
              padding: "0.4rem 0.7rem"
            }}
          >
            {action} (placeholder)
          </button>
        ))}
      </div>
    </header>
  );
}
