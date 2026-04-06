import Link from "next/link";
import { PackageOverview } from "@/components/package/PackageOverview";

export default function PackagesPage() {
  return (
    <main className="page-shell">
      <h1>Packages</h1>
      <p className="muted">
        Artifact transport and compatibility view for portable package files (import/export/bundling semantics), distinct
        from Library browsing and Marketplace discovery.
      </p>
      <Link href="/studio" style={{ color: "var(--accent)" }}>
        Open Studio workspace
      </Link>
      <PackageOverview />
    </main>
  );
}
