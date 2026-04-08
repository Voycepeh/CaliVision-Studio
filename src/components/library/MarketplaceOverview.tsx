"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createDerivedRegistryEntry, loadLocalRegistryEntries, queryPackageCatalog, type PackageRegistryEntry } from "@/lib/registry";

export function MarketplaceOverview() {
  const [entries, setEntries] = useState<PackageRegistryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

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

  function forkRemix(entryId: string) {
    const next = createDerivedRegistryEntry({ entryId, relation: "fork" });
    setEntries(loadLocalRegistryEntries());
    setMessage(`Forked ${next.summary.title}. Open it from Library or the editor to continue editing.`);
  }

  return (
    <section className="card" style={{ marginTop: "1rem", display: "grid", gap: "0.7rem" }}>
      <h2 style={{ margin: 0 }}>Drill Exchange discovery (local/mock)</h2>
      <p className="muted" style={{ margin: 0 }}>
        Exchange is today powered by local/mock entries to shape discovery, import, and fork/remix UX. Hosted sharing,
        auth, and community features are intentionally deferred.
      </p>

      <label style={{ display: "grid", gap: "0.2rem", color: "var(--muted)", fontSize: "0.84rem" }}>
        <span>Search shared drills</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ border: "1px solid var(--border)", borderRadius: "0.5rem", background: "var(--panel-soft)", color: "var(--text)", padding: "0.45rem" }}
        />
      </label>

      <div style={{ display: "grid", gap: "0.45rem" }}>
        {catalog.entries.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing listed yet. Publish a drill from Drill Studio (mock publish) to populate Exchange discovery.
          </p>
        ) : (
          catalog.entries.map((entry) => (
            <article key={entry.entryId} className="card" style={{ margin: 0 }}>
              <strong>{entry.summary.title}</strong>
              <p className="muted" style={{ margin: "0.3rem 0" }}>
                Revision {entry.summary.packageVersion} • {entry.summary.authorDisplayName}
              </p>
              <p className="muted" style={{ margin: 0 }}>{entry.details.description}</p>
              <div style={{ marginTop: "0.45rem", display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                <Link className="pill" href={`/studio?packageId=${encodeURIComponent(entry.summary.packageId)}`}>
                  Open in Editor
                </Link>
                <Link className="pill" href="/library">
                  Import via Library
                </Link>
                <button type="button" className="pill" onClick={() => forkRemix(entry.entryId)}>
                  Fork / Remix
                </button>
              </div>
            </article>
          ))
        )}
      </div>
      {message ? <p className="muted" style={{ margin: 0 }}>{message}</p> : null}
    </section>
  );
}
