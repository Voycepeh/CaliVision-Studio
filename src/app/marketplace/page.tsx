import Link from "next/link";

export default function MarketplacePage() {
  return (
    <main className="page-shell">
      <h1>Marketplace</h1>
      <p className="muted">
        Placeholder-only route for future drill sharing and commercial package publishing. No marketplace behavior is
        implemented in this PR.
      </p>
      <Link href="/studio" style={{ color: "var(--accent)" }}>
        Open Studio workspace
      </Link>
    </main>
  );
}
