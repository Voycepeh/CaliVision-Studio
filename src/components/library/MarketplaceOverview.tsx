"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadLocalRegistryEntries, queryPackageCatalog, type PackageRegistryEntry } from "@/lib/registry";

export function MarketplaceOverview() {
  const [entries, setEntries] = useState<PackageRegistryEntry[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setEntries(loadLocalRegistryEntries());
  }, []);

  const catalog = useMemo(
    () =>
      queryPackageCatalog(
        entries.filter((entry) => entry.summary.sourceType === "mock-published" || entry.summary.publishStatus === "published"),
        { searchText: search, sourceTypes: [], tags: [], sortBy: "updated-desc" }
      ),
    [entries, search]
  );

  return (
    <section className="card" style={{ marginTop: "1rem", display: "grid", gap: "0.7rem" }}>
      <h2 style={{ margin: 0 }}>Marketplace Discovery (Local-First Groundwork)</h2>
      <p className="muted" style={{ margin: 0 }}>
        This route intentionally mimics a future shared marketplace using local/mock registry entries only. No auth,
        cloud storage, comments, ratings, or cross-user sharing exists yet.
      </p>

      <label style={{ display: "grid", gap: "0.2rem", color: "var(--muted)", fontSize: "0.84rem" }}>
        <span>Search listed packages</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ border: "1px solid var(--border)", borderRadius: "0.5rem", background: "var(--panel-soft)", color: "var(--text)", padding: "0.45rem" }}
        />
      </label>

      <div style={{ display: "grid", gap: "0.45rem" }}>
        {catalog.entries.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No mock-published entries yet. Publish from Studio to populate this discovery surface.
          </p>
        ) : (
          catalog.entries.map((entry) => (
            <article key={entry.entryId} className="card" style={{ margin: 0 }}>
              <strong>{entry.summary.title}</strong>
              <p className="muted" style={{ margin: "0.3rem 0" }}>
                {entry.summary.packageId} • v{entry.summary.packageVersion} • {entry.summary.authorDisplayName} • {entry.summary.provenanceSummary}
              </p>
              <p className="muted" style={{ margin: 0 }}>
                {entry.details.description}
              </p>
              <div style={{ marginTop: "0.45rem", display: "flex", gap: "0.45rem" }}>
                <Link className="pill" href={`/studio?packageId=${encodeURIComponent(entry.summary.packageId)}`}>
                  Open in Studio
                </Link>
                <Link className="pill" href="/library">
                  Add/Install via Library
                </Link>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
