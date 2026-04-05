import Link from "next/link";
import { LibraryOverview } from "@/components/library/LibraryOverview";

export default function LibraryPage() {
  return (
    <main className="page-shell">
      <h1>Library</h1>
      <p className="muted">
        This route intentionally provides a structured placeholder for drills, assets, drill files, and recent work.
      </p>
      <Link href="/studio" style={{ color: "var(--accent)" }}>
        Open Studio workspace
      </Link>
      <LibraryOverview />
    </main>
  );
}
