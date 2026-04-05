import Link from "next/link";

export default function PackagesPage() {
  return (
    <main className="page-shell">
      <h1>Packages</h1>
      <p style={{ color: "var(--muted)" }}>
        Placeholder route for the packages workflow. Full functionality lands in follow-up PRs.
      </p>
      <Link href="/studio" style={{ color: "var(--accent)" }}>
        Open Studio workspace
      </Link>
    </main>
  );
}
