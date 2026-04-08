"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { deleteHostedDraft, listMyHostedDrafts, loadHostedDraft, upsertHostedDraft } from "@/lib/hosted/repository";
import type { HostedDraftSummary } from "@/lib/hosted/types";
import {
  deleteHostedLibraryItem,
  listHostedLibrary,
  upsertHostedLibraryItem,
  type HostedLibraryItem
} from "@/lib/hosted/library-repository";
import { isSupabaseConfigured } from "@/lib/supabase/public-env";
import { promoteHostedDraftToHostedLibrary, promoteLocalDraftToLocalLibrary } from "@/lib/library/draft-promotion";
import { buildBundleForExport, downloadPackageBundle, getPrimarySamplePackage, packageKeyFromFile, readPackageFile } from "@/lib/package";
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
type ItemActionState = {
  pendingActionByItemId: Record<string, string>;
  actionMessageByItemId: Record<string, string>;
  actionErrorByItemId: Record<string, string>;
};

export function LibraryOverview() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [entries, setEntries] = useState<PackageRegistryEntry[]>([]);
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<PackageListingSort>("updated-desc");
  const [localDrafts, setLocalDrafts] = useState<LocalDraftSummary[]>([]);
  const [hostedDrafts, setHostedDrafts] = useState<HostedDraftSummary[]>([]);
  const [hostedLibrary, setHostedLibrary] = useState<HostedLibraryItem[]>([]);
  const { session, persistenceMode } = useAuth();
  const [{ pendingActionByItemId, actionMessageByItemId, actionErrorByItemId }, setItemActionState] = useState<ItemActionState>({
    pendingActionByItemId: {},
    actionMessageByItemId: {},
    actionErrorByItemId: {}
  });
  const signedInMode = persistenceMode === "cloud";
  const refreshDrafts = useCallback(async (): Promise<void> => {
    try {
      setLocalDrafts(await loadDraftList());
    } catch {
      setItemFeedback("global:drafts", "Local draft storage is unavailable in this browser.", "error");
    }
  }, []);

  const refreshHostedDrafts = useCallback(async (): Promise<void> => {
    if (!session || !isSupabaseConfigured()) {
      setHostedDrafts([]);
      return;
    }

    const result = await listMyHostedDrafts(session);
    if (result.ok) {
      setHostedDrafts(result.value);
      return;
    }

    setItemFeedback("global:hosted-drafts", result.error, "error");
  }, [session]);

  const refreshHostedLibrary = useCallback(async (): Promise<void> => {
    if (!session || !isSupabaseConfigured()) {
      setHostedLibrary([]);
      return;
    }

    const result = await listHostedLibrary(session);
    if (result.ok) {
      setHostedLibrary(result.value);
      return;
    }

    setItemFeedback("global:hosted-library", result.error, "error");
  }, [session]);

  useEffect(() => {
    if (signedInMode) {
      setEntries([]);
      setLocalDrafts([]);
      void refreshHostedDrafts();
      void refreshHostedLibrary();
      return;
    }

    setHostedDrafts([]);
    setHostedLibrary([]);
    refreshLibrary();
    void refreshDrafts();
  }, [refreshDrafts, refreshHostedDrafts, refreshHostedLibrary, signedInMode]);


  function setItemFeedback(itemId: string, nextMessage: string, tone: FeedbackTone = "success"): void {
    setItemActionState((current) => ({
      ...current,
      actionMessageByItemId: {
        ...current.actionMessageByItemId,
        [itemId]: tone === "success" ? nextMessage : ""
      },
      actionErrorByItemId: {
        ...current.actionErrorByItemId,
        [itemId]: tone === "error" ? nextMessage : ""
      }
    }));
  }

  async function runItemAction(itemId: string, actionLabel: string, run: () => Promise<void>): Promise<void> {
    setItemActionState((current) => ({
      ...current,
      pendingActionByItemId: {
        ...current.pendingActionByItemId,
        [itemId]: actionLabel
      },
      actionMessageByItemId: {
        ...current.actionMessageByItemId,
        [itemId]: ""
      },
      actionErrorByItemId: {
        ...current.actionErrorByItemId,
        [itemId]: ""
      }
    }));

    try {
      await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Action failed. Please try again.";
      setItemFeedback(itemId, message, "error");
    } finally {
      setItemActionState((current) => {
        const nextPending = { ...current.pendingActionByItemId };
        delete nextPending[itemId];
        return {
          ...current,
          pendingActionByItemId: nextPending
        };
      });
    }
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

  const hostedCatalog = useMemo(() => {
    const normalizedSearch = searchText.trim().toLocaleLowerCase();
    const filtered = hostedLibrary.filter((item) => {
      if (!normalizedSearch) return true;
      return [item.title, item.summary, item.packageId].some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "title-asc") {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === "publish-status") {
        return a.title.localeCompare(b.title);
      }
      return new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime();
    });
  }, [hostedLibrary, searchText, sortBy]);

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
    if (signedInMode && session) {
      const hosted = await upsertHostedDraft(session, { packageJson: next });
      if (!hosted.ok) {
        setItemFeedback("global:create", hosted.error, "error");
        return;
      }

      setItemFeedback("global:create", "Created a new drill draft.");
      await refreshHostedDrafts();
      router.push(`/studio?hostedDraftId=${encodeURIComponent(hosted.value.id)}`);
      return;
    }

    await saveDraft({
      draftId,
      sourceLabel: "authored-local",
      packageJson: next,
      assetsById: {}
    });
    setItemFeedback("global:create", "Created a new drill draft.");
    await refreshDrafts();
    router.push(`/studio?draftId=${encodeURIComponent(draftId)}`);
  }

  async function onSaveDraftToLibrary(draftId: string): Promise<void> {
    if (signedInMode && session) {
      const loaded = await loadDraft(draftId);
      if (!loaded) {
        setItemFeedback(`draft:${draftId}`, "Draft could not be loaded.", "error");
        return;
      }
      const saved = await upsertHostedLibraryItem(session, loaded.record.packageJson);
      if (!saved.ok) {
        setItemFeedback(`draft:${draftId}`, saved.error, "error");
        return;
      }
      setItemFeedback(`draft:${draftId}`, `Saved "${saved.value.title}" to My drills.`);
      await refreshHostedLibrary();
      return;
    }

    try {
      await promoteLocalDraftToLocalLibrary({
        loadDraftPackage: async () => (await loadDraft(draftId))?.record.packageJson ?? null,
        saveToMyDrills: async (packageJson) => {
          const saved = upsertRegistryEntryFromPackage({
            packageJson,
            sourceType: "authored-local",
            sourceLabel: `draft:${draftId}`
          });
          return { title: saved.summary.title };
        },
        deleteDraft: async () => deleteDraft(draftId)
      });
      setItemFeedback(`draft:${draftId}`, "Moved to My drills.");
      refreshLibrary();
      await refreshDrafts();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Draft could not be saved to My drills.";
      setItemFeedback(`draft:${draftId}`, errorMessage, "error");
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
      setItemFeedback("global:import", `Import failed for ${file.name}: ${imported.error}${issueSuffix}`, "error");
      return;
    }

    if (signedInMode && session) {
      const saved = await upsertHostedLibraryItem(session, imported.packageViewModel.package);
      if (!saved.ok) {
        setItemFeedback("global:import", saved.error, "error");
        return;
      }
      setItemFeedback("global:import", `Imported "${saved.value.title}" into My drills.`);
      await refreshHostedLibrary();
      return;
    }

    try {
      const saved = upsertRegistryEntryFromPackage({
        packageJson: imported.packageViewModel.package,
        sourceType: "imported-local",
        sourceLabel: `library-import:${file.name}`
      });
      refreshLibrary();
      setItemFeedback("global:import", `Imported "${saved.summary.title}" into My drills.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Imported file could not be added to My drills.";
      setItemFeedback("global:import", errorMessage, "error");
    }
  }

  async function onDeleteDraft(draftId: string): Promise<void> {
    if (!window.confirm("Delete this local draft from this browser?")) {
      return;
    }
    await deleteDraft(draftId);
    setItemFeedback(`draft:${draftId}`, "Deleted local draft.");
    await refreshDrafts();
  }

  async function onDuplicateDraft(draftId: string): Promise<void> {
    await duplicateDraft(draftId);
    setItemFeedback(`draft:${draftId}`, "Duplicated draft.");
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
    setItemFeedback(`drill:${entry.entryId}`, "Created a draft copy.");
    await refreshDrafts();
  }

  async function onDeleteDrill(entry: PackageRegistryEntry): Promise<void> {
    if (!window.confirm("Delete this drill from My drills? Linked local drafts for this drill version will also be removed.")) {
      return;
    }

    const removed = deleteRegistryEntry(entry.entryId);
    if (!removed) {
      setItemFeedback(`drill:${entry.entryId}`, "Drill was already removed.", "error");
      return;
    }

    const removedDraftCount = await deleteDraftsForPackage(entry.summary.packageId, entry.summary.packageVersion);
    setItemFeedback(
      `drill:${entry.entryId}`,
      removedDraftCount > 0 ? `Deleted drill and ${removedDraftCount} linked draft(s).` : "Deleted drill from My drills."
    );
    refreshLibrary();
    await refreshDrafts();
  }

  async function onDeleteHostedDrill(item: HostedLibraryItem): Promise<void> {
    if (!session) {
      setItemFeedback(`hosted-drill:${item.id}`, "Sign in to manage My drills in your account.", "error");
      return;
    }
    if (!window.confirm("Delete this drill from My drills?")) {
      return;
    }

    const removed = await deleteHostedLibraryItem(session, item.id);
    if (!removed.ok) {
      setItemFeedback(`hosted-drill:${item.id}`, removed.error, "error");
      return;
    }

    setItemFeedback(`hosted-drill:${item.id}`, "Deleted drill from My drills.");
    await refreshHostedLibrary();
  }

  async function onExportDrillFile(itemId: string, packageJson: PackageRegistryEntry["details"]["packageJson"]): Promise<void> {
    const result = await buildBundleForExport(packageJson, {});
    downloadPackageBundle(result.bundle, packageJson);
    const warningSuffix = result.warnings.length > 0 ? ` (${result.warnings.length} missing asset warning${result.warnings.length > 1 ? "s" : ""})` : "";
    setItemFeedback(itemId, `Exported drill file.${warningSuffix}`);
  }

  async function onOpenHostedLibraryItem(item: HostedLibraryItem): Promise<void> {
    if (!session) {
      setItemFeedback(`hosted-drill:${item.id}`, "Sign in to open this drill.", "error");
      return;
    }

    const hosted = await upsertHostedDraft(session, { packageJson: item.content });
    if (!hosted.ok) {
      setItemFeedback(`hosted-drill:${item.id}`, hosted.error, "error");
      return;
    }

    setItemFeedback(`hosted-drill:${item.id}`, "Opened drill in Drafts.");
    await refreshHostedDrafts();
    router.push(`/studio?hostedDraftId=${encodeURIComponent(hosted.value.id)}`);
  }

  async function onDeleteHostedDraft(draft: HostedDraftSummary): Promise<void> {
    if (!session) {
      setItemFeedback(`hosted-draft:${draft.id}`, "Sign in to manage Drafts.", "error");
      return;
    }
    if (!window.confirm("Delete this draft?")) {
      return;
    }
    const removed = await deleteHostedDraft(session, draft.id);
    if (!removed.ok) {
      setItemFeedback(`hosted-draft:${draft.id}`, removed.error, "error");
      return;
    }
    setItemFeedback(`hosted-draft:${draft.id}`, "Deleted draft.");
    await refreshHostedDrafts();
  }

  async function onSaveHostedDraftToLibrary(draft: HostedDraftSummary): Promise<void> {
    if (!session) {
      setItemFeedback(`hosted-draft:${draft.id}`, "Sign in to manage Drafts.", "error");
      return;
    }

    try {
      await promoteHostedDraftToHostedLibrary({
        loadDraftPackage: async () => {
          const loaded = await loadHostedDraft(session, draft.id);
          if (!loaded.ok) {
            throw new Error(loaded.error);
          }
          return loaded.value.content;
        },
        saveToMyDrills: async (packageJson) => {
          const saved = await upsertHostedLibraryItem(session, packageJson);
          if (!saved.ok) {
            throw new Error(saved.error);
          }
          return { title: saved.value.title };
        },
        deleteDraft: async () => {
          const removed = await deleteHostedDraft(session, draft.id);
          if (!removed.ok) {
            throw new Error(`Draft cleanup failed: ${removed.error}`);
          }
        }
      });
    } catch (error) {
      setItemFeedback(`hosted-draft:${draft.id}`, error instanceof Error ? error.message : "Draft promotion failed.", "error");
      return;
    }

    setItemFeedback(`hosted-draft:${draft.id}`, "Moved to My drills.");
    await refreshHostedDrafts();
    await refreshHostedLibrary();
  }

  return (
    <section style={libraryLayoutStyle}>
      <section className="card" style={headerCardStyle}>
        <h2 style={{ margin: 0 }}>Library</h2>
        <p className="muted" style={{ margin: 0 }}>
          Start a new drill, continue Drafts, open My drills, import drill files, or browse Exchange.
        </p>
        <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
          Storage mode: {signedInMode ? "Cloud workspace (account)" : "Browser workspace (local only)"}
        </p>
        <div style={compactActionRowStyle}>
          <button
            type="button"
            style={primaryButtonStyle}
            disabled={Boolean(pendingActionByItemId["global:create"])}
            onClick={() => void runItemAction("global:create", "Creating drill…", onCreateDraft)}
          >
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
          <h3 style={{ margin: 0 }}>Drafts</h3>
          <p className="muted" style={{ margin: 0 }}>
            {signedInMode
              ? "Your in-progress drafts in your account."
              : "Your in-progress drafts on this browser/device."}
          </p>
        </div>
        {signedInMode ? (
          hostedDrafts.length === 0 ? (
            <article style={emptyStateStyle}><p className="muted" style={{ margin: 0 }}>No drafts yet. Create one from Studio or Library.</p></article>
          ) : (
            <div style={listStackStyle}>
              {hostedDrafts.map((draft) => (
                <article key={draft.id} className="card" style={listCardStyle}>
                  <div style={rowTitleWrapStyle}>
                    <strong>{draft.title}</strong>
                    <p className="muted" style={{ margin: 0 }}>{draft.status} • v{draft.packageVersion}</p>
                  </div>
                  <p className="muted" style={{ margin: 0 }}>Updated {new Date(draft.updatedAtIso).toLocaleString()}</p>
                  <div style={compactActionRowStyle}>
                    <Link className="pill" href={`/studio?hostedDraftId=${encodeURIComponent(draft.id)}`}>
                      Open
                    </Link>
                    <button
                      type="button"
                      style={chipStyle(true)}
                      disabled={Boolean(pendingActionByItemId[`hosted-draft:${draft.id}`])}
                      onClick={() =>
                        void runItemAction(`hosted-draft:${draft.id}`, "Saving to My drills…", () => onSaveHostedDraftToLibrary(draft))
                      }
                    >
                      Save to My drills
                    </button>
                    <button type="button" style={chipStyle(false)} disabled title="Duplicate for hosted drafts is not available yet.">
                      Duplicate draft
                    </button>
                    <button
                      type="button"
                      style={chipStyle(false)}
                      disabled={Boolean(pendingActionByItemId[`hosted-draft:${draft.id}`])}
                      onClick={() =>
                        void runItemAction(`hosted-draft:${draft.id}`, "Deleting draft…", () => onDeleteHostedDraft(draft))
                      }
                    >
                      Delete draft
                    </button>
                  </div>
                  <InlineItemFeedback itemId={`hosted-draft:${draft.id}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
                </article>
              ))}
            </div>
          )
        ) : localDrafts.length === 0 ? (
          <article style={emptyStateStyle}>
            <p className="muted" style={{ margin: 0 }}>
              No drafts yet. Start with <strong>New drill</strong>.
            </p>
          </article>
        ) : (
          <div style={listStackStyle}>
            {localDrafts.map((draft) => (
              <article key={draft.draftId} className="card" style={listCardStyle}>
                <div style={rowTitleWrapStyle}>
                  <strong>{draft.title}</strong>
                  <p className="muted" style={{ margin: 0 }}>
                    {draft.phaseCount} phases • {draft.hasAssets ? "has images" : "no images"}
                  </p>
                </div>
                <p className="muted" style={{ margin: 0 }}>Updated {new Date(draft.updatedAtIso).toLocaleString()}</p>
                <div style={compactActionRowStyle}>
                  <Link className="pill" href={`/studio?draftId=${encodeURIComponent(draft.draftId)}`}>
                    Continue editing
                  </Link>
                  <button
                    type="button"
                    style={chipStyle(true)}
                    disabled={Boolean(pendingActionByItemId[`draft:${draft.draftId}`])}
                    onClick={() => void runItemAction(`draft:${draft.draftId}`, "Saving to My drills…", () => onSaveDraftToLibrary(draft.draftId))}
                  >
                    Save to My drills
                  </button>
                  <button
                    type="button"
                    style={chipStyle(false)}
                    disabled={Boolean(pendingActionByItemId[`draft:${draft.draftId}`])}
                    onClick={() => void runItemAction(`draft:${draft.draftId}`, "Duplicating draft…", () => onDuplicateDraft(draft.draftId))}
                  >
                    Duplicate draft
                  </button>
                  <button
                    type="button"
                    style={chipStyle(false)}
                    disabled={Boolean(pendingActionByItemId[`draft:${draft.draftId}`])}
                    onClick={() => void runItemAction(`draft:${draft.draftId}`, "Deleting draft…", () => onDeleteDraft(draft.draftId))}
                  >
                    Delete draft
                  </button>
                </div>
                <InlineItemFeedback itemId={`draft:${draft.draftId}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
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
        {signedInMode ? hostedCatalog.length === 0 ? (
          <article style={emptyStateStyle}>
            <p className="muted" style={{ margin: 0 }}>
              No drills yet. Save a draft or import a drill file to populate My drills.
            </p>
          </article>
        ) : (
          <div style={listStackStyle}>
            {hostedCatalog.map((item) => (
              <article key={item.id} className="card" style={listCardStyle}>
                <div style={rowTitleWrapStyle}>
                  <strong>{item.title}</strong>
                  <p className="muted" style={{ margin: 0 }}>v{item.packageVersion} • account</p>
                </div>
                <div style={compactActionRowStyle}>
                  <button
                    type="button"
                    style={chipStyle(true)}
                    disabled={Boolean(pendingActionByItemId[`hosted-drill:${item.id}`])}
                    onClick={() => void runItemAction(`hosted-drill:${item.id}`, "Opening in Studio…", () => onOpenHostedLibraryItem(item))}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    style={chipStyle(false)}
                    disabled={Boolean(pendingActionByItemId[`hosted-drill:${item.id}`])}
                    onClick={() =>
                      void runItemAction(`hosted-drill:${item.id}`, "Exporting drill file…", () =>
                        onExportDrillFile(`hosted-drill:${item.id}`, item.content)
                      )
                    }
                  >
                    Export drill file
                  </button>
                  <button
                    type="button"
                    style={chipStyle(false)}
                    disabled={Boolean(pendingActionByItemId[`hosted-drill:${item.id}`])}
                    onClick={() => void runItemAction(`hosted-drill:${item.id}`, "Deleting drill…", () => onDeleteHostedDrill(item))}
                  >
                    Delete
                  </button>
                </div>
                <InlineItemFeedback itemId={`hosted-drill:${item.id}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
              </article>
            ))}
          </div>
        ) : catalog.entries.length === 0 ? (
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
                    v{entry.summary.packageVersion} • {entry.summary.phaseCount} phases
                  </p>
                </div>
                <div style={compactActionRowStyle}>
                  <Link className="pill" href={`/studio?packageId=${encodeURIComponent(entry.summary.packageId)}`}>
                    Open
                  </Link>
                  <button
                    type="button"
                    style={chipStyle(false)}
                    disabled={Boolean(pendingActionByItemId[`drill:${entry.entryId}`])}
                    onClick={() => void runItemAction(`drill:${entry.entryId}`, "Duplicating drill…", () => onDuplicateDrill(entry))}
                  >
                    Save copy
                  </button>
                  <button
                    type="button"
                    style={chipStyle(false)}
                    disabled={Boolean(pendingActionByItemId[`drill:${entry.entryId}`])}
                    onClick={() => void runItemAction(`drill:${entry.entryId}`, "Exporting drill file…", () => onExportDrillFile(`drill:${entry.entryId}`, entry.details.packageJson))}
                  >
                    Export drill file
                  </button>
                  <button
                    type="button"
                    style={chipStyle(false)}
                    disabled={Boolean(pendingActionByItemId[`drill:${entry.entryId}`])}
                    onClick={() => void runItemAction(`drill:${entry.entryId}`, "Deleting drill…", () => onDeleteDrill(entry))}
                  >
                    Delete
                  </button>
                </div>
                <InlineItemFeedback itemId={`drill:${entry.entryId}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
              </article>
            ))}
          </div>
        )}
      </section>
      <InlineItemFeedback itemId="global:create" pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
      <InlineItemFeedback itemId="global:import" pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
      <InlineItemFeedback itemId="global:hosted-drafts" pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
      <InlineItemFeedback itemId="global:hosted-library" pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
      <InlineItemFeedback itemId="global:drafts" pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
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

const sectionHeadingStyle: CSSProperties = {
  display: "grid",
  gap: "0.25rem"
};

function InlineItemFeedback({
  itemId,
  pending,
  success,
  error
}: {
  itemId: string;
  pending: Record<string, string>;
  success: Record<string, string>;
  error: Record<string, string>;
}) {
  if (pending[itemId]) {
    return <p className="muted" style={{ margin: 0 }}>{pending[itemId]}</p>;
  }

  if (error[itemId]) {
    return <p className="muted" style={{ margin: 0, color: "#f2bbbb" }}>{error[itemId]}</p>;
  }

  if (success[itemId]) {
    return <p className="muted" style={{ margin: 0, color: "var(--success)" }}>{success[itemId]}</p>;
  }

  return null;
}

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
