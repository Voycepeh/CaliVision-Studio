import Link from "next/link";

const routes = [
  ["Studio", "/studio", "Flagship 3-panel authoring workspace"],
  ["Library", "/library", "Drill and asset source management surface"],
  ["Packages", "/packages", "Package import/export and validation hub"],
  ["Marketplace", "/marketplace", "Future publishing and discovery (placeholder)"]
] as const;

export default function HomePage() {
  return (
    <main className="page-shell">
      <span className="pill">Foundation PR • Web-first authoring</span>
      <h1 style={{ marginBottom: "0.5rem" }}>CaliVision Studio</h1>
      <p className="muted" style={{ maxWidth: "72ch" }}>
        A desktop-first Drill Studio foundation aligned to Android-compatible portable packages. This build focuses on
        architecture, contracts, and UI shell placeholders with local mock data only.
      </p>

      <div className="route-grid">
        {routes.map(([title, href, description]) => (
          <Link key={href} href={href} className="route-card">
            <h2 style={{ marginTop: 0 }}>{title}</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              {description}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
