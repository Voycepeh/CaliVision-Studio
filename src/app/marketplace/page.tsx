import Link from "next/link";
import { MarketplaceOverview } from "@/components/library/MarketplaceOverview";

export default function MarketplacePage() {
  return (
    <main className="page-shell">
      <h1>Marketplace</h1>
      <p className="muted">
        Future hosted package discovery route. Currently powered by local/mock registry listings to establish marketplace
        mental models before backend integration.
      </p>
      <Link href="/studio" style={{ color: "var(--accent)" }}>
        Open Studio workspace
      </Link>
      <MarketplaceOverview />
    </main>
  );
}
