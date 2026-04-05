import Link from "next/link";

const navItems = [
  { href: "/studio", label: "Studio" },
  { href: "/library", label: "Library" },
  { href: "/packages", label: "Packages" },
  { href: "/marketplace", label: "Marketplace" }
];

export function TopBar() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--border)",
        padding: "0.8rem 1rem",
        background: "rgba(10,15,24,0.92)",
        backdropFilter: "blur(4px)",
        gap: "1rem"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <div>
          <strong>CaliVision Studio</strong>
          <p style={{ margin: "0.2rem 0 0", color: "var(--muted)", fontSize: "0.8rem" }}>
            Web-first authoring • package-first workflow
          </p>
        </div>
        <nav style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="pill">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <span style={{ color: "var(--success)", fontSize: "0.85rem" }}>Saved (local mock)</span>
        {[
          "Import",
          "Export",
          "Publish",
          "Settings/Profile"
        ].map((action) => (
          <button
            key={action}
            type="button"
            style={{
              border: "1px solid var(--border)",
              borderRadius: "0.6rem",
              background: "var(--panel-elevated)",
              color: "var(--text)",
              padding: "0.45rem 0.75rem",
              cursor: "pointer"
            }}
          >
            {action}
          </button>
        ))}
      </div>
    </header>
  );
}
