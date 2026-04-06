"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collectCatalogTags,
  DEFAULT_PACKAGE_LISTING_QUERY,
  installRegistryEntryToLibrary,
  loadLocalRegistryEntries,
  queryPackageCatalog,
  type PackageListingSort,
  type PackageRegistryEntry,
  type PackageSourceType
} from "@/lib/registry";

const SOURCE_FILTERS: PackageSourceType[] = ["authored-local", "imported-local", "installed-local", "mock-published"];

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

  return (
    <section className="card" style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
      <h2 style={{ margin: 0 }}>Local Library Registry</h2>
      <p className="muted" style={{ margin: 0 }}>
        Library is your local package inventory (authored/imported/installed). It is local-first and designed to map to
        future hosted registries without changing package contracts.
      </p>

      <div className="field-grid" style={{ alignItems: "end" }}>
        <label style={labelStyle}>
          <span>Search title/package id</span>
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
          <button key={source} type="button" style={chipStyle(sourceTypes.includes(source))} onClick={() => toggleSourceType(source)}>
            {source}
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
          <h3 style={{ marginTop: 0 }}>Packages ({catalog.totalCount})</h3>
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
                  {entry.summary.packageVersion} • {entry.summary.phaseCount} phases • {entry.summary.hasAssets ? "assets" : "no assets"}
                </span>
                <span className="muted">
                  {entry.summary.authorDisplayName} • {entry.summary.sourceType} • {entry.summary.publishStatus}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Package details</h3>
          {!selected ? (
            <p className="muted" style={{ marginBottom: 0 }}>
              No packages match this query.
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
                <li>Origin: {selected.details.origin.sourceType}</li>
                <li>Source label: {selected.details.origin.sourceLabel}</li>
                <li>Author: {selected.summary.authorDisplayName}</li>
                <li>Schema: {selected.summary.schemaVersion}</li>
                <li>Compatibility: {selected.summary.compatibilitySummary}</li>
                <li>Updated: {new Date(selected.summary.updatedAtIso).toLocaleString()}</li>
                <li>Published: {selected.summary.publishedAtIso ? new Date(selected.summary.publishedAtIso).toLocaleString() : "—"}</li>
              </ul>
              <p className="muted" style={{ margin: 0 }}>{selected.details.description}</p>
              <div className="muted" style={{ fontSize: "0.85rem" }}>
                Phases: {selected.details.phaseTitles.join(" • ") || "None"}
              </div>
              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                <Link className="pill" href={`/studio?packageId=${encodeURIComponent(selected.summary.packageId)}`}>
                  Open in Studio
                </Link>
                <Link className="pill" href="/packages">
                  Export / Transport
                </Link>
                <button type="button" style={chipStyle(false)} onClick={() => onInstall(selected.entryId)}>
                  Install to Library
                </button>
                <button type="button" style={chipStyle(false)}>
                  Duplicate / Fork (local)
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
