import Link from "next/link";
import { LibraryOverview } from "@/components/library/LibraryOverview";

export default function LibraryPage() {
  return (
    <main className="page-shell">
      <h1>Library</h1>
      <p className="muted">
        Main local package management surface for authored/imported/installed drill packages with local-first
        registry-style browsing.
      </p>
      <Link href="/studio" style={{ color: "var(--accent)" }}>
        Open Studio workspace
      </Link>
      <LibraryOverview />
    </main>
  );
}
