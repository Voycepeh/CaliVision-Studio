"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import { getPrimarySamplePackage, packageKeyFromFile, readPackageFile } from "@/lib/package";
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

type FeedbackTone = "success" | "error";

export function LibraryOverview() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [entries, setEntries] = useState<PackageRegistryEntry[]>([]);
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<PackageListingSort>("updated-desc");
  const [localDrafts, setLocalDrafts] = useState<LocalDraftSummary[]>([]);
  const [message, setMessage] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>("success");

  const refreshDrafts = useCallback(async (): Promise<void> => {
    try {
      setLocalDrafts(await loadDraftList());
    } catch {
      setFeedback("Local draft storage is unavailable in this browser.", "error");
    }
  }, []);

  useEffect(() => {
    refreshLibrary();
    void refreshDrafts();
  }, [refreshDrafts]);

  function setFeedback(nextMessage: string, tone: FeedbackTone = "success"): void {
    setMessage(nextMessage);
    setFeedbackTone(tone);
  }

  function refreshLibrary(): void {
    setEntries(loadLocalRegistryEntries());
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
    next.drills[0].title = "New drill draft";
    await saveDraft({
      draftId,
      sourceLabel: "authored-local",
      packageJson: next,
      assetsById: {}
    });
    setFeedback("Created a new drill draft.");
    await refreshDrafts();
    router.push(`/studio?draftId=${encodeURIComponent(draftId)}`);
  }

  async function onSaveDraftToLibrary(draftId: string): Promise<void> {
    const loaded = await loadDraft(draftId);
    if (!loaded) {
      setFeedback("Draft could not be loaded.", "error");
      return;
    }

    try {
      const saved = upsertRegistryEntryFromPackage({
        packageJson: loaded.record.packageJson,
        sourceType: "authored-local",
        sourceLabel: `draft:${draftId}`
      });
      await deleteDraft(draftId);
      setFeedback(`Saved \"${saved.summary.title}\" to My drills and removed the local draft.`);
      refreshLibrary();
      await refreshDrafts();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Draft could not be saved to My drills.";
      setFeedback(errorMessage, "error");
    }
  }

  async function onImportFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const imported = await readPackageFile(file, packageKeyFromFile(file));
    if (!imported.ok) {
      const issueCount = imported.validation?.issues.length ?? 0;
      const issueSuffix = issueCount > 0 ? ` (${issueCount} validation issue${issueCount > 1 ? "s" : ""})` : "";
      setFeedback(`Import failed for ${file.name}: ${imported.error}${issueSuffix}`, "error");
      return;
    }

    try {
      const saved = upsertRegistryEntryFromPackage({
        packageJson: imported.packageViewModel.package,
        sourceType: "imported-local",
        sourceLabel: `library-import:${file.name}`
      });
      refreshLibrary();
      setFeedback(`Imported \"${saved.summary.title}\" into My drills.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Imported file could not be added to My drills.";
      setFeedback(errorMessage, "error");
    }
  }

  async function onDeleteDraft(draftId: string): Promise<void> {
    if (!window.confirm("Delete this local draft from this browser?")) {
      return;
    }
    await deleteDraft(draftId);
    setFeedback("Deleted local draft.");
    await refreshDrafts();
  }

  async function onDuplicateDraft(draftId: string): Promise<void> {
    await duplicateDraft(draftId);
    setFeedback("Duplicated local draft.");
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
    setFeedback("Created a drill draft copy from My drills.");
    await refreshDrafts();
  }

  async function onDeleteDrill(entry: PackageRegistryEntry): Promise<void> {
    if (!window.confirm("Delete this drill from My drills? Linked local drafts for this drill version will also be removed.")) {
      return;
    }

    const removed = deleteRegistryEntry(entry.entryId);
    if (!removed) {
      setFeedback("Drill was already removed.", "error");
      return;
    }

    const removedDraftCount = await deleteDraftsForPackage(entry.summary.packageId, entry.summary.packageVersion);
    setFeedback(removedDraftCount > 0 ? `Deleted drill and ${removedDraftCount} linked draft(s).` : "Deleted drill from My drills.");
    refreshLibrary();
    await refreshDrafts();
  }

  return (
    <section style={libraryLayoutStyle}>
      <section className="card" style={headerCardStyle}>
        <h2 style={{ margin: 0 }}>Library</h2>
        <p className="muted" style={{ margin: 0 }}>
          Start a new drill, continue local drafts, open saved drills, import drill files, or browse Exchange.
        </p>
        <div style={compactActionRowStyle}>
          <button type="button" style={primaryButtonStyle} onClick={() => void onCreateDraft()}>
            New drill
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json,.cvpkg.json"
            style={{ display: "none" }}
            onChange={(event) => void onImportFileChange(event)}
          />
          <button type="button" style={chipStyle(false)} onClick={() => fileInputRef.current?.click()}>
            Import drill file
          </button>
        </div>
      </section>

      <section className="card" style={sectionCardStyle}>
        <div style={sectionHeadingStyle}>
          <h3 style={{ margin: 0 }}>Recent local drafts</h3>
          <p className="muted" style={{ margin: 0 }}>
            Browser-local editable drafts. Save to library only when you want a persistent drill record.
          </p>
        </div>
        {localDrafts.length === 0 ? (
          <article style={emptyStateStyle}>
            <p className="muted" style={{ margin: 0 }}>
              No local drafts yet. Start with <strong>New drill</strong>.
            </p>
          </article>
        ) : (
          <div style={listStackStyle}>
            {localDrafts.map((draft) => (
              <article key={draft.draftId} className="card" style={listCardStyle}>
                <div style={rowTitleWrapStyle}>
                  <strong>{draft.title}</strong>
                  <p className="muted" style={{ margin: 0 }}>
                    {draft.phaseCount} phases • {draft.hasAssets ? "has local images" : "no images"}
                  </p>
                </div>
                <p className="muted" style={{ margin: 0 }}>Last edited {new Date(draft.updatedAtIso).toLocaleString()}</p>
                <div style={compactActionRowStyle}>
                  <Link className="pill" href={`/studio?draftId=${encodeURIComponent(draft.draftId)}`}>
                    Continue editing
                  </Link>
                  <button type="button" style={chipStyle(true)} onClick={() => void onSaveDraftToLibrary(draft.draftId)}>
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

      <section className="card" style={sectionCardStyle}>
        <div style={sectionHeadingStyle}>
          <h3 style={{ margin: 0 }}>My drills</h3>
          <p className="muted" style={{ margin: 0 }}>
            Saved drills are searchable, sortable, and ready for editing, export, or deletion.
          </p>
        </div>
        <div style={filtersRowStyle}>
          <label style={{ ...labelStyle, minWidth: "min(100%, 280px)", flex: "1 1 320px" }}>
            <span>Search drills</span>
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              style={inputStyle}
              placeholder="Search by title, tags, or drill ID"
            />
          </label>
          <label style={{ ...labelStyle, width: "min(100%, 210px)", flex: "0 0 min(100%, 210px)" }}>
            <span>Sort</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as PackageListingSort)} style={inputStyle}>
              <option value="updated-desc">Recently Updated</option>
              <option value="title-asc">Title A→Z</option>
              <option value="publish-status">Publish Status</option>
            </select>
          </label>
        </div>
        {catalog.entries.length === 0 ? (
          <article style={emptyStateStyle}>
            <p className="muted" style={{ margin: 0 }}>
              No saved drills yet. Promote a draft or import a drill file to populate My drills.
            </p>
          </article>
        ) : (
          <div style={listStackStyle}>
            {catalog.entries.map((entry) => (
              <article key={entry.entryId} className="card" style={listCardStyle}>
                <div style={rowTitleWrapStyle}>
                  <strong>{entry.summary.title}</strong>
                  <p className="muted" style={{ margin: 0 }}>
                    v{entry.summary.packageVersion} • {entry.summary.phaseCount} phases • {entry.summary.sourceType}
                  </p>
                </div>
                <div style={compactActionRowStyle}>
                  <Link className="pill" href={`/studio?packageId=${encodeURIComponent(entry.summary.packageId)}`}>
                    Open
                  </Link>
                  <button type="button" style={chipStyle(false)} onClick={() => void onDuplicateDrill(entry)}>
                    Duplicate
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

      <section className="card" style={toolsCardStyle}>
        <h3 style={{ margin: 0 }}>More tools</h3>
        <div style={compactActionRowStyle}>
          <Link className="pill" href="/upload">
            Upload Video
          </Link>
          <Link className="pill" href="/marketplace">
            Browse Exchange
          </Link>
        </div>
      </section>

      {message ? (
        <p className="muted" style={{ margin: 0, color: feedbackTone === "error" ? "#f2bbbb" : "var(--success)" }}>
          {message}
        </p>
      ) : null}
    </section>
  );
}

const libraryLayoutStyle: CSSProperties = {
  marginTop: "0.8rem",
  display: "grid",
  gap: "0.65rem"
};

const headerCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.55rem",
  padding: "0.85rem"
};

const sectionCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.55rem",
  padding: "0.8rem"
};

const toolsCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
  padding: "0.7rem",
  background: "rgba(24, 36, 53, 0.45)"
};

const sectionHeadingStyle: CSSProperties = {
  display: "grid",
  gap: "0.25rem"
};

const listStackStyle: CSSProperties = {
  display: "grid",
  gap: "0.4rem"
};

const listCardStyle: CSSProperties = {
  margin: 0,
  padding: "0.6rem",
  display: "grid",
  gap: "0.4rem",
  background: "linear-gradient(180deg, rgba(19, 28, 42, 0.95), rgba(15, 21, 32, 0.95))"
};

const rowTitleWrapStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem"
};

const emptyStateStyle: CSSProperties = {
  margin: 0,
  border: "1px dashed var(--border)",
  borderRadius: "0.7rem",
  padding: "0.65rem",
  background: "rgba(19, 28, 42, 0.45)"
};

const compactActionRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.4rem",
  flexWrap: "wrap",
  alignItems: "center"
};

const filtersRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.55rem",
  alignItems: "end",
  flexWrap: "wrap"
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: "0.23rem",
  color: "var(--muted)",
  fontSize: "0.82rem"
};

const inputStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.58rem",
  padding: "0.42rem 0.52rem",
  background: "var(--panel-soft)",
  color: "var(--text)",
  width: "100%"
};

const primaryButtonStyle: CSSProperties = {
  ...chipStyle(true),
  color: "var(--text)",
  borderColor: "rgba(114, 168, 255, 0.65)",
  background: "var(--accent-soft)"
};

function chipStyle(active: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? "rgba(114, 168, 255, 0.55)" : "var(--border)"}`,
    borderRadius: "999px",
    padding: "0.28rem 0.62rem",
    fontSize: "0.78rem",
    color: active ? "var(--text)" : "var(--muted)",
    background: active ? "rgba(114, 168, 255, 0.12)" : "var(--panel-soft)",
    cursor: "pointer"
  };
}
