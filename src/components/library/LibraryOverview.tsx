"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getPrimarySamplePackage } from "@/lib/package";
import {
  DEFAULT_PACKAGE_LISTING_QUERY,
  deleteRegistryEntry,
  loadLocalRegistryEntries,
  queryPackageCatalog,
  upsertRegistryEntryFromPackage,
  type PackageListingSort,
  type PackageRegistryEntry
} from "@/lib/registry";
import {
  deleteDraft,
  deleteDraftsForPackage,
  duplicateDraft,
  loadDraft,
  loadDraftList,
  saveDraft,
  type LocalDraftSummary
} from "@/lib/persistence/local-draft-store";

export function LibraryOverview() {
  const router = useRouter();
  const [entries, setEntries] = useState<PackageRegistryEntry[]>([]);
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<PackageListingSort>("updated-desc");
  const [localDrafts, setLocalDrafts] = useState<LocalDraftSummary[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    refreshLibrary();
    void refreshDrafts();
  }, []);

  function refreshLibrary(): void {
    setEntries(loadLocalRegistryEntries());
  }

  async function refreshDrafts(): Promise<void> {
    try {
      setLocalDrafts(await loadDraftList());
    } catch {
      setMessage("Local draft storage is unavailable in this browser.");
    }
  }

  const catalog = useMemo(
    () =>
      queryPackageCatalog(entries, {
        ...DEFAULT_PACKAGE_LISTING_QUERY,
        searchText,
        sortBy
      }),
    [entries, searchText, sortBy]
  );

  async function onCreateDraft(): Promise<void> {
    const sample = getPrimarySamplePackage();
    const createdAt = new Date().toISOString();
    const draftId = `draft-${Date.now()}`;
    const next = structuredClone(sample);
    next.manifest.packageId = `local-draft-${Date.now()}`;
    next.manifest.packageVersion = "0.1.0";
    next.manifest.createdAtIso = createdAt;
    next.manifest.updatedAtIso = createdAt;
    next.drills[0].title = "Untitled drill";
    next.drills[0].description = "";

    await saveDraft({
      draftId,
      sourceLabel: "authored-local",
      packageJson: next,
      assetsById: {}
    });

    setMessage("Started a new local draft.");
    await refreshDrafts();
    router.push(`/studio?draftId=${encodeURIComponent(draftId)}`);
  }

  async function onSaveDraftToLibrary(draftId: string): Promise<void> {
    const loaded = await loadDraft(draftId);
    if (!loaded) {
      setMessage("Draft could not be loaded.");
      return;
    }

    upsertRegistryEntryFromPackage({
      packageJson: loaded.record.packageJson,
      sourceType: "authored-local",
      sourceLabel: `draft:${draftId}`
    });
    setMessage("Saved draft to My drills.");
    refreshLibrary();
  }

  async function onDeleteDraft(draftId: string): Promise<void> {
    if (!window.confirm("Delete this local draft from this browser?")) {
      return;
    }
    await deleteDraft(draftId);
    setMessage("Deleted local draft.");
    await refreshDrafts();
  }

  async function onDuplicateDraft(draftId: string): Promise<void> {
    await duplicateDraft(draftId);
    setMessage("Duplicated local draft.");
    await refreshDrafts();
  }

  async function onDuplicateDrill(entry: PackageRegistryEntry): Promise<void> {
    const duplicateId = `draft-${Date.now()}`;
    await saveDraft({
      draftId: duplicateId,
      sourceLabel: `duplicate:${entry.entryId}`,
      packageJson: structuredClone(entry.details.packageJson),
      assetsById: {}
    });
    setMessage("Created a draft copy from My drills.");
    await refreshDrafts();
  }

  async function onDeleteDrill(entry: PackageRegistryEntry): Promise<void> {
    if (!window.confirm("Delete this drill from My drills? Linked local drafts for this drill version will also be removed.")) {
      return;
    }

    const removed = deleteRegistryEntry(entry.entryId);
    if (!removed) {
      setMessage("Drill was already removed.");
      return;
    }

    const removedDraftCount = await deleteDraftsForPackage(entry.summary.packageId, entry.summary.packageVersion);
    setMessage(removedDraftCount > 0 ? `Deleted drill and ${removedDraftCount} linked draft(s).` : "Deleted drill from My drills.");
    refreshLibrary();
    await refreshDrafts();
  }

  return (
    <section style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
      <section className="card" style={{ display: "grid", gap: "0.7rem" }}>
        <h2 style={{ margin: 0 }}>Library</h2>
        <p className="muted" style={{ margin: 0 }}>
          Start a new drill, continue local drafts, open saved drills, import drill files, and browse Drill Exchange.
        </p>
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          <button type="button" style={primaryActionStyle} onClick={() => void onCreateDraft()}>
            New drill
          </button>
          <Link className="pill" href="/studio">
            Open Studio
          </Link>
          <Link className="pill" href="/marketplace">
            Browse Exchange
          </Link>
        </div>
      </section>

      <section className="card" style={{ display: "grid", gap: "0.65rem" }}>
        <h3 style={{ margin: 0 }}>Recent local drafts</h3>
        <p className="muted" style={{ margin: 0 }}>
          Drafts are local to this browser/device. Save to library when you want the drill to appear in My drills.
        </p>
        {localDrafts.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No local drafts yet. Select <strong>New drill</strong> to start editing immediately in Drill Studio.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.45rem" }}>
            {localDrafts.map((draft) => (
              <article key={draft.draftId} className="card" style={{ margin: 0 }}>
                <strong>{draft.title}</strong>
                <p className="muted" style={{ margin: "0.2rem 0 0.3rem" }}>
                  {draft.phaseCount} phases • {draft.hasAssets ? "has local images" : "no images"}
                </p>
                <p className="muted" style={{ margin: "0 0 0.4rem" }}>Last edited: {new Date(draft.updatedAtIso).toLocaleString()}</p>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <Link className="pill" href={`/studio?draftId=${encodeURIComponent(draft.draftId)}`}>
                    Continue draft
                  </Link>
                  <button type="button" style={chipStyle(false)} onClick={() => void onSaveDraftToLibrary(draft.draftId)}>
                    Save to library
                  </button>
                  <button type="button" style={chipStyle(false)} onClick={() => void onDuplicateDraft(draft.draftId)}>
                    Duplicate draft
                  </button>
                  <button type="button" style={chipStyle(false)} onClick={() => void onDeleteDraft(draft.draftId)}>
                    Delete draft
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ display: "grid", gap: "0.65rem" }}>
        <h3 style={{ margin: 0 }}>My drills</h3>
        <div className="field-grid" style={{ alignItems: "end" }}>
          <label style={labelStyle}>
            <span>Search drills</span>
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
        {catalog.entries.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No saved drills yet. Drafts appear here only after Save to library, import, or publish.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "0.45rem" }}>
            {catalog.entries.map((entry) => (
              <article key={entry.entryId} className="card" style={{ margin: 0 }}>
                <strong>{entry.summary.title}</strong>
                <p className="muted" style={{ margin: "0.2rem 0 0.4rem" }}>
                  v{entry.summary.packageVersion} • {entry.summary.phaseCount} phases • {entry.summary.sourceType}
                </p>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <Link className="pill" href={`/studio?packageId=${encodeURIComponent(entry.summary.packageId)}`}>
                    Open in Studio
                  </Link>
                  <button type="button" style={chipStyle(false)} onClick={() => void onDuplicateDrill(entry)}>
                    Duplicate to draft
                  </button>
                  <Link className="pill" href={`/studio?packageId=${encodeURIComponent(entry.summary.packageId)}`}>
                    Export drill
                  </Link>
                  <button type="button" style={chipStyle(false)} onClick={() => void onDeleteDrill(entry)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ display: "grid", gap: "0.5rem" }}>
        <h3 style={{ margin: 0 }}>Import / export tools</h3>
        <p className="muted" style={{ margin: 0 }}>
          Import and export drill files from Studio. These technical tools stay secondary so Library remains drill-first.
        </p>
        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
          <Link className="pill" href="/studio">
            Import drill file
          </Link>
          <Link className="pill" href="/studio">
            Export drill
          </Link>
          <Link className="pill" href="/upload">Upload Video</Link>
        </div>
      </section>

      {message ? <p className="muted" style={{ margin: 0 }}>{message}</p> : null}
    </section>
  );
}

const labelStyle: CSSProperties = {
  display: "grid",
  gap: "0.25rem",
  color: "var(--muted)",
  fontSize: "0.84rem"
};

const inputStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.55rem",
  background: "var(--panel-soft)",
  color: "var(--text)",
  padding: "0.45rem"
};

function chipStyle(active: boolean): CSSProperties {
  return {
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    borderRadius: "999px",
    background: active ? "var(--accent-soft)" : "var(--panel-elevated)",
    color: "var(--text)",
    padding: "0.38rem 0.7rem",
    cursor: "pointer"
  };
}

const primaryActionStyle: CSSProperties = {
  border: "1px solid var(--accent)",
  borderRadius: "999px",
  background: "var(--accent-soft)",
  color: "var(--text)",
  fontWeight: 700,
  padding: "0.42rem 0.85rem",
  cursor: "pointer"
};
