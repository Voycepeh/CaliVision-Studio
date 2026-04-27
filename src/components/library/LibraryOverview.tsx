"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import { DrillSelectionPreviewPanel } from "@/components/upload/DrillSelectionPreviewPanel";
import { DrillVisualPreview } from "@/components/library/DrillVisualPreview";
import { summarizeBenchmark } from "@/lib/drills/benchmark";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  listMyExchangePublications,
  publishDrillToExchange,
  removeOwnPublicationFromPublic,
  type ExchangePublication
} from "@/lib/exchange";
import {
  createDrill,
  createDraftVersion,
  deleteDrill,
  importDrillPackage,
  listDrillsWithActiveVersion,
  listVersionsForDrill,
  markVersionReady,
  publishVersion,
  type DrillLibraryItem,
  type DrillVersionSnapshot
} from "@/lib/library";
import { getOrBuildKnowledgeForPackage, type DrillKnowledgeDocument } from "@/lib/knowledge";
import { buildBundleForExport, downloadPackageBundle, packageKeyFromFile, readPackageFile } from "@/lib/package";
import { type PackageListingSort } from "@/lib/registry";
import {
  buildWorkflowDrillKey,
  setActiveDrillContext,
  type ActiveDrillContext
} from "@/lib/workflow/drill-context";

type FeedbackTone = "success" | "error";
type ItemActionState = {
  pendingActionByItemId: Record<string, string>;
  actionMessageByItemId: Record<string, string>;
  actionErrorByItemId: Record<string, string>;
};

type PublishMetadataDraft = {
  title: string;
  shortDescription: string;
  fullDescription: string;
  category: string;
  difficulty: string;
  equipment: string;
  tagsInput: string;
};

function toHumanErrorMessage(error: unknown): string {
  const fallback = "Action failed. Please try again.";
  const message = error instanceof Error ? error.message : fallback;
  if (/Duplicate version conflict/i.test(message)) {
    return "This drill version already exists. Refresh and continue editing the existing version.";
  }
  if (/Failed to save hosted drill/i.test(message)) {
    return "Could not save this drill right now. Please retry in a moment.";
  }
  if (/Local browser save failed/i.test(message)) {
    return "Could not save this drill locally. Reload and try again.";
  }
  return message;
}

export function LibraryOverview() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [drills, setDrills] = useState<DrillLibraryItem[]>([]);
  const [versionsByDrillId, setVersionsByDrillId] = useState<Record<string, DrillVersionSnapshot[]>>({});
  const [searchText, setSearchText] = useState("");
  const [selectedDrillId, setSelectedDrillId] = useState<string | null>(null);
  const [previewDrillId, setPreviewDrillId] = useState<string | null>(null);
  const [publishTargetDrillId, setPublishTargetDrillId] = useState<string | null>(null);
  const [publishDraftByDrillId, setPublishDraftByDrillId] = useState<Record<string, PublishMetadataDraft>>({});
  const [myExchangePublications, setMyExchangePublications] = useState<ExchangePublication[]>([]);
  const [sortBy, setSortBy] = useState<PackageListingSort>("updated-desc");
  const [exchangeFeedback, setExchangeFeedback] = useState<{ status: "added" | "already"; title: string } | null>(null);
  const { persistenceMode, session } = useAuth();
  const [{ pendingActionByItemId, actionMessageByItemId, actionErrorByItemId }, setItemActionState] = useState<ItemActionState>({
    pendingActionByItemId: {},
    actionMessageByItemId: {},
    actionErrorByItemId: {}
  });
  const signedInMode = persistenceMode === "cloud";
  const repositoryContext = useMemo(
    () => ({
      mode: signedInMode ? "cloud" : "local",
      session
    }) as const,
    [session, signedInMode]
  );

  const exchangeBySourceDrillId = useMemo(
    () => Object.fromEntries(myExchangePublications.map((publication) => [publication.sourceDrillId, publication])),
    [myExchangePublications]
  );

  const refreshLibrary = useCallback(async (): Promise<void> => {
    const nextDrills = await listDrillsWithActiveVersion(repositoryContext);
    setDrills(nextDrills);
    const versions = await Promise.all(nextDrills.map((item) => listVersionsForDrill(item.drillId, repositoryContext)));
    setVersionsByDrillId(Object.fromEntries(nextDrills.map((item, index) => [item.drillId, versions[index] ?? []])));
    if (signedInMode && session) {
      const exchange = await listMyExchangePublications(session);
      setMyExchangePublications(exchange.ok ? exchange.value : []);
    } else {
      setMyExchangePublications([]);
    }
  }, [repositoryContext, session, signedInMode]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const exchangeAdded = params.get("exchangeAdded");
    const exchangeAddedTitle = params.get("title");
    if (!exchangeAdded) {
      setExchangeFeedback(null);
      return;
    }
    setExchangeFeedback({
      status: exchangeAdded === "already" ? "already" : "added",
      title: exchangeAddedTitle ?? "Drill"
    });
  }, []);

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
      const message = toHumanErrorMessage(error);
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

  const filteredDrills = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const filtered = drills.filter((drill) => !q || drill.title.toLowerCase().includes(q) || drill.drillId.toLowerCase().includes(q));
    return [...filtered].sort((a, b) => {
      if (sortBy === "title-asc") return a.title.localeCompare(b.title);
      if (sortBy === "publish-status") return Number(Boolean(b.activeReadyVersion?.isPublished)) - Number(Boolean(a.activeReadyVersion?.isPublished));
      return b.updatedAtIso.localeCompare(a.updatedAtIso);
    });
  }, [drills, searchText, sortBy]);

  const knowledgeByDrillId = useMemo(() => {
    const candidatePackages = drills.map((item) => item.currentVersion.packageJson);
    return Object.fromEntries(
      drills.map((item) => [
        item.drillId,
        getOrBuildKnowledgeForPackage({
          packageJson: item.currentVersion.packageJson,
          candidatePackages
        })
      ])
    ) as Record<string, DrillKnowledgeDocument>;
  }, [drills]);
  const titleByDrillId = useMemo(() => Object.fromEntries(drills.map((drill) => [drill.drillId, drill.title])), [drills]);

  async function onCreateDraft(): Promise<void> {
    const created = await createDrill(repositoryContext);
    persistActiveDrillContext({
      drillId: created.drillId,
      sourceKind: signedInMode ? "hosted" : "local",
      sourceId: created.draftVersionId
    });
    setItemFeedback("global:create", "Created a new drill draft.");
    await refreshLibrary();
    router.push(`/studio?drillId=${encodeURIComponent(created.drillId)}`);
  }

  async function onOpenForEdit(drill: DrillLibraryItem): Promise<void> {
    const selectedContext = await resolveDrillContext(drill, true);
    persistActiveDrillContext(selectedContext);
    router.push(`/studio?drillId=${encodeURIComponent(drill.drillId)}`);
  }

  function persistActiveDrillContext(context: ActiveDrillContext): void {
    setActiveDrillContext(context);
  }

  async function resolveDrillContext(drill: DrillLibraryItem, requireEditableDraft: boolean): Promise<ActiveDrillContext> {
    const sourceVersion = drill.openDraftVersion ?? drill.currentVersion;
    if (!requireEditableDraft && sourceVersion.sourceId) {
      return {
        drillId: drill.drillId,
        sourceKind: signedInMode ? "hosted" : "local",
        sourceId: sourceVersion.sourceId
      };
    }

    if (sourceVersion.source === "draft" && sourceVersion.sourceId) {
      return {
        drillId: drill.drillId,
        sourceKind: signedInMode ? "hosted" : "local",
        sourceId: sourceVersion.sourceId
      };
    }

    const drafted = await createDraftVersion(drill.drillId, repositoryContext);
    await refreshLibrary();
    return {
      drillId: drill.drillId,
      sourceKind: signedInMode ? "hosted" : "local",
      sourceId: drafted.draftVersionId
    };
  }

  async function onOpenWorkflow(drill: DrillLibraryItem, destination: "upload" | "live"): Promise<void> {
    const context = await resolveDrillContext(drill, false);
    persistActiveDrillContext(context);
    const workflowKey = buildWorkflowDrillKey(context);
    router.push(`/${destination}?drillKey=${encodeURIComponent(workflowKey)}`);
  }

  async function onDeleteDrill(drill: DrillLibraryItem): Promise<void> {
    const confirmed = window.confirm(`Delete drill "${drill.title}" and all versions? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    // Delete is intentionally destructive-only: do not create drafts and do not navigate to Studio.
    await deleteDrill(drill.drillId, repositoryContext);
    setItemFeedback(`drill:${drill.drillId}`, "Deleted drill and all versions.");
    await refreshLibrary();
  }

  async function onMarkReady(drill: DrillLibraryItem): Promise<void> {
    if (!drill.latestDraftVersionId) {
      setItemFeedback(`drill:${drill.drillId}`, "No draft version exists to mark ready.", "error");
      return;
    }

    await markVersionReady(drill.latestDraftVersionId, repositoryContext);
    setItemFeedback(`drill:${drill.drillId}`, "Draft marked Ready.");
    await refreshLibrary();
  }

  async function onPublish(drill: DrillLibraryItem): Promise<void> {
    if (!signedInMode || !session) {
      setItemFeedback(`drill:${drill.drillId}`, "Sign in to publish this drill to Drill Exchange.", "error");
      return;
    }
    if (!drill.activeReadyVersion) {
      setItemFeedback(`drill:${drill.drillId}`, "Only Ready versions can be published.", "error");
      return;
    }

    await publishVersion(drill.activeReadyVersion, repositoryContext);
    const draft = publishDraftByDrillId[drill.drillId] ?? buildPublishDraftFromDrill(drill);
    const tags = draft.tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const exchange = await publishDrillToExchange(session, {
      sourceVersion: drill.activeReadyVersion,
      creatorDisplayName: session.user.email?.split("@")[0] ?? "Studio creator",
      metadata: {
        title: draft.title,
        shortDescription: draft.shortDescription,
        fullDescription: draft.fullDescription,
        category: draft.category,
        difficulty: draft.difficulty,
        equipment: draft.equipment,
        tags
      }
    });
    if (!exchange.ok) {
      throw new Error(exchange.error);
    }
    setItemFeedback(`drill:${drill.drillId}`, "Ready version published.");
    setPublishTargetDrillId(null);
    await refreshLibrary();
  }

  async function onRemoveFromPublic(publication: ExchangePublication): Promise<void> {
    if (!session) {
      setItemFeedback(`drill:${publication.sourceDrillId}`, "Sign in to manage Exchange publication visibility.", "error");
      return;
    }
    const confirmed = window.confirm(`Remove "${publication.title}" from public Drill Exchange? Imported drills in users' libraries will remain available.`);
    if (!confirmed) {
      return;
    }
    const result = await removeOwnPublicationFromPublic(session, { publicationId: publication.id, nextStatus: "archived" });
    if (!result.ok) {
      throw new Error(result.error);
    }
    setItemFeedback(`drill:${publication.sourceDrillId}`, `Removed "${publication.title}" from public Drill Exchange.`);
    await refreshLibrary();
  }

  function formatVisibilityStatus(status: ExchangePublication["visibilityStatus"]): string {
    if (status === "published") return "Published";
    if (status === "hidden") return "Hidden";
    if (status === "archived") return "Archived";
    return "Deleted";
  }

  function buildPublishDraftFromDrill(drill: DrillLibraryItem): PublishMetadataDraft {
    const source = drill.activeReadyVersion?.packageJson.drills[0];
    return {
      title: source?.title ?? drill.title,
      shortDescription: source?.description ?? "",
      fullDescription: "",
      category: "General",
      difficulty: source?.difficulty ?? "beginner",
      equipment: "",
      tagsInput: source?.tags?.join(", ") ?? ""
    };
  }

  function updatePublishDraft(drillId: string, patch: Partial<PublishMetadataDraft>): void {
    setPublishDraftByDrillId((current) => ({
      ...current,
      [drillId]: {
        ...(current[drillId] ?? {
          title: "",
          shortDescription: "",
          fullDescription: "",
          category: "General",
          difficulty: "beginner",
          equipment: "",
          tagsInput: ""
        }),
        ...patch
      }
    }));
  }

  async function onImportFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const imported = await readPackageFile(file, packageKeyFromFile(file));
    if (!imported.ok) {
      setItemFeedback("global:import", `Import failed for ${file.name}: ${imported.error}`, "error");
      return;
    }

    const result = await importDrillPackage(
      {
        packageJson: imported.packageViewModel.package,
        sourceLabel: `library-import:${file.name}`
      },
      repositoryContext
    );
    if (result.status === "duplicate") {
      setItemFeedback("global:import", `"${result.title}" already exists in ${result.workspace === "cloud" ? "Cloud workspace" : "Browser workspace"}. No changes made.`);
    } else {
      setItemFeedback("global:import", `Imported "${result.title}" into ${result.workspace === "cloud" ? "Cloud workspace" : "Browser workspace"}.`);
    }
    if (result.workspace === "cloud" && result.matchedOtherWorkspace) {
      setItemFeedback("global:import:ownership", `This drill file also matches a drill in Browser workspace. Cloud and Browser workspaces stay separate.`);
    } else {
      setItemFeedback("global:import:ownership", "");
    }
    await refreshLibrary();
  }

  async function onExportDrillFile(itemId: string, version: DrillVersionSnapshot): Promise<void> {
    const result = await buildBundleForExport(version.packageJson, {});
    downloadPackageBundle(result.bundle, version.packageJson);
    setItemFeedback(itemId, `Exported drill file${result.warnings.length > 0 ? ` (${result.warnings.length} missing asset warnings)` : ""}.`);
  }

  return (
    <section id="my-drills" style={libraryLayoutStyle}>
      <section className="card" style={headerCardStyle}>
        <h2 style={{ margin: 0 }}>My Drills (secondary workspace)</h2>
        {exchangeFeedback ? (
          <p className="muted" style={{ margin: 0, color: "#b5e3c3" }}>
            {exchangeFeedback.status === "already"
              ? `"${exchangeFeedback.title}" is already in My Library.`
              : `Added "${exchangeFeedback.title}" to My Library.`}
          </p>
        ) : null}
        <p className="muted" style={{ margin: 0 }}>
          Use My Drills for created drills, draft drills, imported drill files, private drills, and advanced authoring workflows.
        </p>
        <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
          Storage mode: {signedInMode ? "Cloud workspace (hosted drills only)" : "Browser workspace (local drills only)"}
        </p>
        <div style={compactActionRowStyle}>
          <button type="button" style={primaryButtonStyle} disabled={Boolean(pendingActionByItemId["global:create"])} onClick={() => void runItemAction("global:create", "Creating drill…", onCreateDraft)}>
            Create Drill (advanced)
          </button>
          <input ref={fileInputRef} type="file" accept="application/json,.json,.cvpkg.json" style={{ display: "none" }} onChange={(event) => void onImportFileChange(event)} />
          <button type="button" style={chipStyle(false)} onClick={() => fileInputRef.current?.click()}>
            Import drill file
          </button>
          <Link href="/marketplace" style={tertiaryLinkStyle}>Explore more on Drill Exchange</Link>
        </div>
      </section>

      <section className="card" style={sectionCardStyle}>
        <div style={filtersRowStyle}>
          <label style={{ ...labelStyle, minWidth: "min(100%, 280px)", flex: "1 1 320px" }}>
            <span>Search drills</span>
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} style={inputStyle} placeholder="Search by title or drill ID" />
          </label>
          <label style={{ ...labelStyle, width: "min(100%, 210px)", flex: "0 0 min(100%, 210px)" }}>
            <span>Sort</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as PackageListingSort)} style={inputStyle}>
              <option value="updated-desc">Recently Updated</option>
              <option value="title-asc">Title A→Z</option>
              <option value="publish-status">Published First</option>
            </select>
          </label>
        </div>

        {filteredDrills.length === 0 ? (
          <article style={emptyStateStyle}>
            <p className="muted" style={{ margin: 0 }}>No drills yet. Explore public drills above to start training quickly, then use <strong>Create Drill (advanced)</strong> for custom authoring.</p>
            <p className="muted" style={{ margin: "0.28rem 0 0", fontSize: "0.8rem" }}>
              Capture reminder: keep full body visible, match camera angle to the drill, and step back if wrists or ankles leave frame.
            </p>
          </article>
        ) : (
          <div style={listStackStyle}>
            {filteredDrills.map((drill) => {
              const versions = versionsByDrillId[drill.drillId] ?? [];
              const workflowSourceVersion = drill.openDraftVersion ?? drill.currentVersion;
              const previewDrill = workflowSourceVersion.packageJson.drills[0];
              const exchangePublication = exchangeBySourceDrillId[drill.drillId];
              const publishDraft = publishDraftByDrillId[drill.drillId] ?? buildPublishDraftFromDrill(drill);
              return (
                <article
                  key={drill.drillId}
                  className="card"
                  style={{
                    ...listCardStyle,
                    borderColor: selectedDrillId === drill.drillId ? "rgba(114, 168, 255, 0.6)" : undefined
                  }}
                  onClick={() => setSelectedDrillId(drill.drillId)}
                >
                  <div style={rowTitleWrapStyle}>
                    <div style={thumbnailShellStyle}>
                      {previewDrill ? (
                        <DrillVisualPreview
                          drill={previewDrill}
                          assets={workflowSourceVersion.packageJson.assets}
                          variant="myDrillsCard"
                          width={200}
                          showMotionPreview
                          motionMode="badge"
                        />
                      ) : (
                        <div style={thumbnailFallbackStyle}>
                          <span className="muted">No thumbnail</span>
                        </div>
                      )}
                    </div>
                    <div style={rowTitleMetaStyle}>
                      <strong style={{ fontSize: "1rem" }}>{drill.title}</strong>
                      <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
                        Source: {signedInMode ? "Cloud workspace" : "Browser workspace"}
                      </p>
                      <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
                        Updated {new Date(drill.updatedAtIso).toLocaleString()}
                      </p>
                      <div style={statusChipRowStyle}>
                        <span style={statusChipStyle(drill.activeReadyVersion ? "ready" : "neutral")}>
                          Ready {drill.activeReadyVersion ? `v${drill.activeReadyVersion.versionNumber}` : "none"}
                        </span>
                        <span style={statusChipStyle(drill.activeReadyVersion?.isPublished ? "published" : "neutral")}>
                          {drill.activeReadyVersion?.isPublished ? "Published" : "Not published"}
                        </span>
                        {drill.openDraftVersion ? (
                          <span style={statusChipStyle("draft")}>Open draft v{drill.openDraftVersion.versionNumber}</span>
                        ) : null}
                        {exchangePublication ? (
                          <span style={statusChipStyle(exchangePublication.visibilityStatus === "published" ? "exchange" : "neutral")}>
                            Exchange: {formatVisibilityStatus(exchangePublication.visibilityStatus)}
                          </span>
                        ) : null}
                      </div>
                      {exchangePublication ? (
                        <p className="muted" style={{ margin: 0, fontSize: "0.76rem" }}>
                          Exchange version ID: {exchangePublication.sourceVersionId}
                          {exchangePublication.visibilityStatus === "published" ? (
                            <>
                              {" "}• <Link href={`/marketplace/${encodeURIComponent(exchangePublication.slug)}`} style={tertiaryLinkStyle}>View in Exchange</Link>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <section style={actionGroupStyle}>
                    <p style={actionGroupLabelStyle}>Primary actions</p>
                    <div style={compactActionRowStyle}>
                      <button type="button" style={primaryActionChipStyle} onClick={() => void runItemAction(`upload:${drill.drillId}`, "Opening Upload Video…", () => onOpenWorkflow(drill, "upload"))}>
                        Upload Video
                      </button>
                      <button type="button" style={primaryActionChipStyle} onClick={() => void runItemAction(`live:${drill.drillId}`, "Opening Live Coaching…", () => onOpenWorkflow(drill, "live"))}>
                        Live Coaching
                      </button>
                      <button type="button" style={chipStyle(true)} onClick={() => void runItemAction(`drill:${drill.drillId}`, "Opening Studio…", () => onOpenForEdit(drill))}>
                        Edit in Studio
                      </button>
                    </div>
                  </section>
                  {previewDrillId === drill.drillId && previewDrill ? (
                    <section style={previewPanelStyle}>
                      <DrillSelectionPreviewPanel
                        drill={previewDrill}
                        sourceKind={signedInMode ? "hosted" : "local"}
                        benchmarkState={summarizeBenchmark(previewDrill.benchmark).present ? "available" : "unavailable"}
                        showSourceBadge
                        compact
                        quiet
                      />
                    </section>
                  ) : null}

                  <section style={manageGroupStyle}>
                    <p style={actionGroupLabelStyle}>Manage drill</p>
                    <div style={compactActionRowStyle}>
                      <button
                        type="button"
                        style={chipStyle(false)}
                        aria-expanded={previewDrillId === drill.drillId}
                        onClick={() => setPreviewDrillId((current) => (current === drill.drillId ? null : drill.drillId))}
                      >
                        {previewDrillId === drill.drillId ? "Hide Preview" : "Preview"}
                      </button>
                      <button type="button" style={chipStyle(false)} onClick={() => void runItemAction(`ready:${drill.drillId}`, "Marking ready…", () => onMarkReady(drill))}>
                        Mark Ready
                      </button>
                      <button
                        type="button"
                        style={chipStyle(false)}
                        onClick={() => {
                          setPublishDraftByDrillId((current) => current[drill.drillId] ? current : { ...current, [drill.drillId]: buildPublishDraftFromDrill(drill) });
                          setPublishTargetDrillId((current) => (current === drill.drillId ? null : drill.drillId));
                        }}
                      >
                        {publishTargetDrillId === drill.drillId ? "Hide Publish Details" : "Publish"}
                      </button>
                      <button type="button" style={chipStyle(false)} onClick={() => void runItemAction(`export:${drill.drillId}`, "Exporting drill file…", () => onExportDrillFile(`drill:${drill.drillId}`, drill.activeReadyVersion ?? drill.currentVersion))}>
                        Export drill file
                      </button>
                      <button type="button" style={chipStyle(false)} onClick={() => void runItemAction(`delete:${drill.drillId}`, "Deleting drill…", () => onDeleteDrill(drill))}>
                        Delete
                      </button>
                      {exchangePublication?.visibilityStatus === "published" ? (
                        <button
                          type="button"
                          style={chipStyle(false)}
                          onClick={() => void runItemAction(`exchange-remove:${drill.drillId}`, "Removing from public…", () => onRemoveFromPublic(exchangePublication))}
                        >
                          Remove from Public
                        </button>
                      ) : null}
                    </div>
                  </section>
                  {publishTargetDrillId === drill.drillId ? (
                    <section className="card" style={{ margin: 0, display: "grid", gap: "0.35rem" }}>
                      <strong>Publish metadata</strong>
                      <label style={labelStyle}>
                        <span>Title</span>
                        <input style={inputStyle} value={publishDraft.title} onChange={(event) => updatePublishDraft(drill.drillId, { title: event.target.value })} />
                      </label>
                      <label style={labelStyle}>
                        <span>Short description</span>
                        <input style={inputStyle} value={publishDraft.shortDescription} onChange={(event) => updatePublishDraft(drill.drillId, { shortDescription: event.target.value })} />
                      </label>
                      <label style={labelStyle}>
                        <span>Full description (optional)</span>
                        <textarea style={inputStyle} value={publishDraft.fullDescription} onChange={(event) => updatePublishDraft(drill.drillId, { fullDescription: event.target.value })} />
                      </label>
                      <div style={filtersRowStyle}>
                        <label style={labelStyle}>
                          <span>Category</span>
                          <input style={inputStyle} value={publishDraft.category} onChange={(event) => updatePublishDraft(drill.drillId, { category: event.target.value })} />
                        </label>
                        <label style={labelStyle}>
                          <span>Difficulty</span>
                          <select style={inputStyle} value={publishDraft.difficulty} onChange={(event) => updatePublishDraft(drill.drillId, { difficulty: event.target.value })}>
                            <option value="beginner">Beginner</option>
                            <option value="intermediate">Intermediate</option>
                            <option value="advanced">Advanced</option>
                          </select>
                        </label>
                        <label style={labelStyle}>
                          <span>Equipment (optional)</span>
                          <input style={inputStyle} value={publishDraft.equipment} onChange={(event) => updatePublishDraft(drill.drillId, { equipment: event.target.value })} />
                        </label>
                      </div>
                      <label style={labelStyle}>
                        <span>Tags (comma-separated)</span>
                        <input style={inputStyle} value={publishDraft.tagsInput} onChange={(event) => updatePublishDraft(drill.drillId, { tagsInput: event.target.value })} />
                      </label>
                      <button type="button" style={chipStyle(true)} onClick={() => void runItemAction(`publish:${drill.drillId}`, "Publishing…", () => onPublish(drill))}>
                        Publish to Drill Exchange
                      </button>
                    </section>
                  ) : null}

                  <details>
                    <summary style={{ cursor: "pointer" }}>Advanced details</summary>
                    <div style={{ display: "grid", gap: "0.35rem", marginTop: "0.35rem" }}>
                      <strong style={{ fontSize: "0.82rem" }}>Version history</strong>
                      <div style={{ display: "grid", gap: "0.28rem" }}>
                        {versions
                          .filter((version) => version.status === "ready")
                          .map((version) => (
                          <div key={version.versionId} style={{ border: "1px solid var(--border)", borderRadius: "0.45rem", padding: "0.3rem 0.4rem" }}>
                            <p className="muted" style={{ margin: 0 }}>
                              v{version.versionNumber} • Ready{version.isPublished ? " • Published" : ""} • {new Date(version.updatedAtIso).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                      <strong style={{ fontSize: "0.82rem" }}>Knowledge</strong>
                      <KnowledgeSections knowledge={knowledgeByDrillId[drill.drillId]} titleByDrillId={titleByDrillId} />
                    </div>
                  </details>

                  <InlineItemFeedback itemId={`drill:${drill.drillId}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
                  <InlineItemFeedback itemId={`live:${drill.drillId}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
                  <InlineItemFeedback itemId={`upload:${drill.drillId}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
                  <InlineItemFeedback itemId={`ready:${drill.drillId}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
                  <InlineItemFeedback itemId={`publish:${drill.drillId}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
                  <InlineItemFeedback itemId={`export:${drill.drillId}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
                  <InlineItemFeedback itemId={`exchange-remove:${drill.drillId}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
                </article>
              );
            })}
          </div>
        )}
      </section>

      <InlineItemFeedback itemId="global:create" pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
      <InlineItemFeedback itemId="global:import" pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
      <InlineItemFeedback itemId="global:import:ownership" pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
    </section>
  );
}

function KnowledgeSections({ knowledge, titleByDrillId }: { knowledge?: DrillKnowledgeDocument; titleByDrillId: Record<string, string> }) {
  if (!knowledge) {
    return (
      <p className="muted" style={{ margin: "0.4rem 0 0" }}>
        No derived knowledge available yet.
      </p>
    );
  }

  const relatedDrillLabels = knowledge.relatedDrillIds.map((drillId) => titleByDrillId[drillId] ?? "Related drill (unavailable in this workspace)");
  const sections: Array<{ label: string; items: string[] }> = [
    { label: "Overview", items: [knowledge.summary, knowledge.orientationNotes].filter(Boolean) },
    { label: "Phases", items: knowledge.phaseOverview },
    { label: "Prerequisites", items: knowledge.prerequisites },
    { label: "Regressions / Progressions", items: [...knowledge.regressions, ...knowledge.progressions] },
    { label: "Common mistakes", items: knowledge.commonMistakes },
    { label: "Detection notes", items: knowledge.detectionCaveats },
    { label: "Related drills", items: relatedDrillLabels }
  ];

  return (
    <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.45rem" }}>
      {sections
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <section key={section.label} style={{ display: "grid", gap: "0.2rem" }}>
            <strong style={{ fontSize: "0.82rem" }}>{section.label}</strong>
            <ul style={{ margin: 0, paddingLeft: "1rem", color: "var(--muted)", fontSize: "0.8rem" }}>
              {section.items.map((item, index) => (
                <li key={`${section.label}-${index}`}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

const libraryLayoutStyle: CSSProperties = { marginTop: "0.45rem", display: "grid", gap: "0.5rem", width: "min(100%, 980px)", marginInline: "auto" };
const headerCardStyle: CSSProperties = { display: "grid", gap: "0.45rem", padding: "0.65rem 0.75rem" };
const sectionCardStyle: CSSProperties = { display: "grid", gap: "0.5rem", padding: "0.65rem 0.75rem" };

function InlineItemFeedback({ itemId, pending, success, error }: { itemId: string; pending: Record<string, string>; success: Record<string, string>; error: Record<string, string> }) {
  if (pending[itemId]) return <p className="muted" style={{ margin: 0, fontSize: "0.76rem" }}>{pending[itemId]}</p>;
  if (error[itemId]) return <p role="alert" style={errorNoticeStyle}>{error[itemId]}</p>;
  if (success[itemId]) return <p style={successNoticeStyle}>{success[itemId]}</p>;
  return null;
}

const listStackStyle: CSSProperties = { display: "grid", gap: "0.35rem" };
const listCardStyle: CSSProperties = { margin: 0, padding: "0.62rem", display: "grid", gap: "0.4rem", background: "linear-gradient(180deg, rgba(19, 28, 42, 0.95), rgba(15, 21, 32, 0.95))" };
const rowTitleWrapStyle: CSSProperties = { display: "flex", gap: "0.65rem", flexWrap: "wrap", alignItems: "flex-start" };
const rowTitleMetaStyle: CSSProperties = { display: "grid", gap: "0.2rem", flex: "1 1 280px", minWidth: "min(100%, 260px)" };
const thumbnailShellStyle: CSSProperties = { flex: "0 0 auto", width: "min(100%, 152px)" };
const thumbnailFallbackStyle: CSSProperties = { width: "152px", height: "86px", borderRadius: "0.55rem", border: "1px dashed var(--border)", display: "grid", placeItems: "center", background: "var(--panel-soft)", fontSize: "0.72rem" };
const statusChipRowStyle: CSSProperties = { display: "flex", gap: "0.28rem", flexWrap: "wrap", marginTop: "0.08rem" };
const emptyStateStyle: CSSProperties = { margin: 0, border: "1px dashed var(--border)", borderRadius: "0.7rem", padding: "0.55rem", background: "rgba(19, 28, 42, 0.45)" };
const compactActionRowStyle: CSSProperties = { display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" };
const previewPanelStyle: CSSProperties = { marginTop: "0.15rem", width: "min(100%, 460px)" };
const actionGroupStyle: CSSProperties = { display: "grid", gap: "0.28rem", marginTop: "0.08rem" };
const manageGroupStyle: CSSProperties = { display: "grid", gap: "0.28rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "0.42rem" };
const actionGroupLabelStyle: CSSProperties = { margin: 0, fontSize: "0.72rem", letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--muted)" };
const filtersRowStyle: CSSProperties = { display: "flex", gap: "0.45rem", alignItems: "end", flexWrap: "wrap" };
const labelStyle: CSSProperties = { display: "grid", gap: "0.18rem", color: "var(--muted)", fontSize: "0.8rem" };
const inputStyle: CSSProperties = { border: "1px solid var(--border)", borderRadius: "0.52rem", padding: "0.38rem 0.5rem", background: "var(--panel-soft)", color: "var(--text)", width: "100%" };
const primaryButtonStyle: CSSProperties = { ...chipStyle(true), color: "var(--text)", borderColor: "rgba(114, 168, 255, 0.65)", background: "var(--accent-soft)", fontWeight: 600 };
const tertiaryLinkStyle: CSSProperties = { color: "var(--muted)", textDecoration: "none", fontSize: "0.78rem", paddingInline: "0.2rem" };
const noticeBaseStyle: CSSProperties = { margin: 0, fontSize: "0.76rem", borderRadius: "0.45rem", padding: "0.3rem 0.4rem", border: "1px solid" };
const errorNoticeStyle: CSSProperties = { ...noticeBaseStyle, color: "#f6cbcb", borderColor: "rgba(255, 120, 120, 0.55)", background: "rgba(120, 23, 23, 0.3)" };
const successNoticeStyle: CSSProperties = { ...noticeBaseStyle, color: "#d2f5da", borderColor: "rgba(100, 198, 132, 0.55)", background: "rgba(28, 72, 36, 0.33)" };
const primaryActionChipStyle: CSSProperties = { ...chipStyle(true), fontWeight: 600, borderColor: "rgba(114, 168, 255, 0.75)" };
type StatusTone = "neutral" | "draft" | "ready" | "published" | "exchange";
function statusChipStyle(tone: StatusTone): CSSProperties {
  const toneByStatus: Record<StatusTone, { border: string; background: string; color: string }> = {
    neutral: { border: "var(--border)", background: "var(--panel-soft)", color: "var(--muted)" },
    draft: { border: "rgba(227, 172, 88, 0.55)", background: "rgba(153, 106, 33, 0.16)", color: "#f0d2a7" },
    ready: { border: "rgba(118, 179, 246, 0.55)", background: "rgba(46, 89, 154, 0.2)", color: "#cde5ff" },
    published: { border: "rgba(109, 204, 144, 0.55)", background: "rgba(36, 89, 52, 0.23)", color: "#d6f5df" },
    exchange: { border: "rgba(175, 137, 239, 0.58)", background: "rgba(98, 70, 139, 0.23)", color: "#e5d8ff" }
  };
  const palette = toneByStatus[tone];
  return {
    margin: 0,
    padding: "0.16rem 0.45rem",
    borderRadius: "999px",
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
    fontSize: "0.7rem",
    lineHeight: 1.25
  };
}
function chipStyle(active: boolean): CSSProperties {
  return { border: `1px solid ${active ? "rgba(114, 168, 255, 0.55)" : "var(--border)"}`, borderRadius: "999px", padding: "0.24rem 0.55rem", fontSize: "0.76rem", color: active ? "var(--text)" : "var(--muted)", background: active ? "rgba(114, 168, 255, 0.12)" : "var(--panel-soft)", cursor: "pointer" };
}
