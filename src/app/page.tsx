import Link from "next/link";

const routes = [
  ["Studio", "/studio", "Primary 3-panel authoring workspace"],
  ["Library", "/library", "Browse drills, templates, and assets"],
  ["Packages", "/packages", "View package export/import queue"],
  ["Marketplace", "/marketplace", "Future sharing and discovery surface"]
] as const;

export default function HomePage() {
  return (
    <main className="page-shell">
      <h1>CaliVision Studio</h1>
      <p style={{ color: "var(--muted)" }}>
        Foundation build for web-first drill authoring and Android-compatible package generation.
      </p>
      <div className="route-grid">
        {routes.map(([title, href, description]) => (
          <Link key={href} href={href} className="route-card">
            <h2 style={{ marginTop: 0 }}>{title}</h2>
            <p style={{ color: "var(--muted)", marginBottom: 0 }}>{description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
