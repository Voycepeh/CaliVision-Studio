"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collectCatalogTags,
  createDerivedRegistryEntry,
  DEFAULT_PACKAGE_LISTING_QUERY,
  installRegistryEntryToLibrary,
  loadLocalRegistryEntries,
  queryPackageCatalog,
  type PackageListingSort,
  type PackageRegistryEntry,
  type PackageSourceType
} from "@/lib/registry";

const SOURCE_FILTERS: Array<{ key: PackageSourceType; label: string }> = [
  { key: "authored-local", label: "Authored" },
  { key: "imported-local", label: "Imported" },
  { key: "installed-local", label: "Installed" },
  { key: "mock-published", label: "Published (Mock)" }
];

export function LibraryOverview() {
  const [entries, setEntries] = useState<PackageRegistryEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [sourceTypes, setSourceTypes] = useState<PackageSourceType[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<PackageListingSort>("updated-desc");
  const [installMessage, setInstallMessage] = useState<string>("");

  useEffect(() => {
    const next = loadLocalRegistryEntries();
    setEntries(next);
    setSelectedEntryId(next[0]?.entryId ?? null);
  }, []);

  const availableTags = useMemo(() => collectCatalogTags(entries), [entries]);

  const catalog = useMemo(
    () =>
      queryPackageCatalog(entries, {
        ...DEFAULT_PACKAGE_LISTING_QUERY,
        searchText,
        sourceTypes,
        tags: selectedTags,
        sortBy
      }),
    [entries, searchText, selectedTags, sortBy, sourceTypes]
  );

  const selected = useMemo(
    () => catalog.entries.find((entry) => entry.entryId === selectedEntryId) ?? catalog.entries[0] ?? null,
    [catalog.entries, selectedEntryId]
  );

  function toggleSourceType(nextSource: PackageSourceType): void {
    setSourceTypes((current) =>
      current.includes(nextSource) ? current.filter((source) => source !== nextSource) : [...current, nextSource]
    );
  }

  function toggleTag(tag: string): void {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  function onInstall(entryId: string): void {
    const result = installRegistryEntryToLibrary(entryId);
    setInstallMessage(result.message);
    const next = loadLocalRegistryEntries();
    setEntries(next);
    setSelectedEntryId(result.entryId);
  }

  function onCreateDerived(entryId: string, relation: "duplicate" | "fork" | "remix" | "new-version"): void {
    try {
      const next = createDerivedRegistryEntry({ entryId, relation });
      const reloaded = loadLocalRegistryEntries();
      setEntries(reloaded);
      setSelectedEntryId(next.entryId);
      setInstallMessage(`Created ${relation} drill package ${next.summary.entryId}.`);
    } catch (error) {
      setInstallMessage(error instanceof Error ? error.message : "Unable to create derived package.");
    }
  }

  const authoredCount = entries.filter((entry) => entry.summary.sourceType === "authored-local").length;
  const importedCount = entries.filter((entry) => entry.summary.sourceType === "imported-local").length;
  const remixedCount = entries.filter((entry) => entry.summary.provenanceSummary.toLowerCase().includes("fork")).length;
  const publishedCount = entries.filter((entry) => entry.summary.publishStatus === "published").length;

  return (
    <section style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
      <section className="card" style={{ display: "grid", gap: "0.7rem" }}>
        <span className="pill" style={{ width: "fit-content" }}>Library Home</span>
        <h2 style={{ margin: 0 }}>Start here</h2>
        <p className="muted" style={{ margin: 0 }}>
          Continue editing recent drills, create new drafts in Drill Studio, import portable package files, explore Drill
          Exchange listings, and prepare exports for the mobile runtime client.
        </p>

        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          <Link className="pill" href="/studio">Open Drill Studio</Link>
          <Link className="pill" href="/upload">Upload Video</Link>
          <Link className="pill" href="/marketplace">Browse Exchange</Link>
          <Link className="pill" href="/packages">Import / Export package tools</Link>
        </div>

        <div className="field-grid">
          <article className="card" style={{ margin: 0 }}>
            <strong>{authoredCount}</strong>
            <p className="muted" style={{ margin: "0.2rem 0 0" }}>Authored drills</p>
          </article>
          <article className="card" style={{ margin: 0 }}>
            <strong>{importedCount}</strong>
            <p className="muted" style={{ margin: "0.2rem 0 0" }}>Imported drills</p>
          </article>
          <article className="card" style={{ margin: 0 }}>
            <strong>{remixedCount}</strong>
            <p className="muted" style={{ margin: "0.2rem 0 0" }}>Forked / remixed drills</p>
          </article>
          <article className="card" style={{ margin: 0 }}>
            <strong>{publishedCount}</strong>
            <p className="muted" style={{ margin: "0.2rem 0 0" }}>Recent mock-published drills</p>
          </article>
        </div>
      </section>

      <section className="card" style={{ display: "grid", gap: "0.65rem" }}>
        <h3 style={{ margin: 0 }}>Drill Library</h3>
        <div className="field-grid" style={{ alignItems: "end" }}>
          <label style={labelStyle}>
            <span>Search drills (title or package id)</span>
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <span>Sort</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as PackageListingSort)} style={inputStyle}>
              <option value="updated-desc">Recently Updated</option>
              <option value="title-asc">Title A→Z</option>
              <option value="publish-status">Publish Status</option>
            </select>
          </label>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          {SOURCE_FILTERS.map((source) => (
            <button key={source.key} type="button" style={chipStyle(sourceTypes.includes(source.key))} onClick={() => toggleSourceType(source.key)}>
              {source.label}
            </button>
          ))}
        </div>

        {availableTags.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {availableTags.map((tag) => (
              <button key={tag} type="button" style={chipStyle(selectedTags.includes(tag))} onClick={() => toggleTag(tag)}>
                #{tag}
              </button>
            ))}
          </div>
        ) : null}

        <div className="field-grid" style={{ alignItems: "start" }}>
          <div className="card" style={{ margin: 0, maxHeight: "440px", overflow: "auto" }}>
            <h4 style={{ marginTop: 0 }}>Drills ({catalog.totalCount})</h4>
            {catalog.entries.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No drills match your filters yet. Create one in Drill Studio or import a package from Package Tools.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "0.45rem" }}>
                {catalog.entries.map((entry) => (
                  <button
                    key={entry.entryId}
                    type="button"
                    onClick={() => setSelectedEntryId(entry.entryId)}
                    style={{
                      ...rowButtonStyle,
                      borderColor: selected?.entryId === entry.entryId ? "var(--accent)" : "var(--border)",
                      background: selected?.entryId === entry.entryId ? "var(--accent-soft)" : "var(--panel-soft)"
                    }}
                  >
                    <strong>{entry.summary.title}</strong>
                    <span className="muted">
                      v{entry.summary.packageVersion} • {entry.summary.phaseCount} phases • {entry.summary.hasAssets ? "has images/assets" : "no assets"}
                    </span>
                    <span className="muted">
                      {entry.summary.authorDisplayName} • {entry.summary.sourceType} • {entry.summary.publishStatus}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ margin: 0 }}>
            <h4 style={{ marginTop: 0 }}>Selected drill</h4>
            {!selected ? (
              <p className="muted" style={{ marginBottom: 0 }}>
                Pick a drill to inspect details and open it in Drill Studio.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                <div>
                  <strong>{selected.summary.title}</strong>
                  <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                    {selected.summary.packageId} • v{selected.summary.packageVersion}
                  </p>
                </div>
                <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
                  <li>Author: {selected.summary.authorDisplayName}</li>
                  <li>Origin: {selected.details.origin.sourceType}</li>
                  <li>Drill status: {selected.summary.statusBadge}</li>
                  <li>Compatibility: {selected.summary.compatibilitySummary}</li>
                  <li>Lineage: {selected.summary.lineageId ?? "—"} (rev {selected.summary.revision ?? 1})</li>
                  <li>Updated: {new Date(selected.summary.updatedAtIso).toLocaleString()}</li>
                </ul>
                <p className="muted" style={{ margin: 0 }}>{selected.details.description}</p>
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  Phases: {selected.details.phaseTitles.join(" • ") || "None"}
                </div>
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                  <Link className="pill" href={`/studio?packageId=${encodeURIComponent(selected.summary.packageId)}`}>
                    Open in Drill Studio
                  </Link>
                  <button type="button" style={chipStyle(false)} onClick={() => onInstall(selected.entryId)}>
                    Add to my Library
                  </button>
                  <button type="button" style={chipStyle(false)} onClick={() => onCreateDerived(selected.entryId, "duplicate")}>
                    Duplicate
                  </button>
                  <button type="button" style={chipStyle(false)} onClick={() => onCreateDerived(selected.entryId, "fork")}>
                    Fork / Remix
                  </button>
                  <button type="button" style={chipStyle(false)} onClick={() => onCreateDerived(selected.entryId, "new-version")}>
                    New Version
                  </button>
                </div>
                {installMessage ? (
                  <p className="muted" style={{ margin: 0 }}>
                    {installMessage}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </section>

      <p className="muted" style={{ margin: 0 }}>
        Studio is the authoring and publishing source of truth. Mobile runtime/live coaching is downstream in Android:
        https://github.com/Voycepeh/CaliVision
      </p>
    </section>
  );
}

const labelStyle = {
  display: "grid",
  gap: "0.25rem",
  color: "var(--muted)",
  fontSize: "0.84rem"
} as const;

const inputStyle = {
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  background: "var(--panel-soft)",
  color: "var(--text)",
  padding: "0.45rem"
} as const;

const rowButtonStyle = {
  display: "grid",
  gap: "0.2rem",
  width: "100%",
  textAlign: "left" as const,
  border: "1px solid var(--border)",
  borderRadius: "0.6rem",
  padding: "0.55rem",
  color: "var(--text)",
  cursor: "pointer"
};

function chipStyle(active: boolean) {
  return {
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    borderRadius: "999px",
    background: active ? "var(--accent-soft)" : "var(--panel-soft)",
    color: "var(--text)",
    padding: "0.26rem 0.65rem",
    fontSize: "0.78rem",
    cursor: "pointer"
  };
}
