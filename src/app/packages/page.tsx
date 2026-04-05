import Link from "next/link";
import { PackageOverview } from "@/components/package/PackageOverview";

export default function PackagesPage() {
  return (
    <main className="page-shell">
      <h1>Drill Files</h1>
      <p className="muted">Drill file authoring and transport workflows are intentionally placeholder-only in this PR.</p>
      <Link href="/studio" style={{ color: "var(--accent)" }}>
        Open Studio workspace
      </Link>
      <PackageOverview />
    </main>
  );
}
