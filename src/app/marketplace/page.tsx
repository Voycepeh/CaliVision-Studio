import Link from "next/link";

export default function MarketplacePage() {
  return (
    <main className="page-shell">
      <h1>Marketplace</h1>
      <p style={{ color: "var(--muted)" }}>
        Placeholder route for the marketplace workflow. Full functionality lands in follow-up PRs.
      </p>
      <Link href="/studio" style={{ color: "var(--accent)" }}>
        Open Studio workspace
      </Link>
    </main>
  );
}
