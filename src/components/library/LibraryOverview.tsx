"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import { DrillSelectionPreviewPanel } from "@/components/upload/DrillSelectionPreviewPanel";
import { useAuth } from "@/lib/auth/AuthProvider";
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
  const [sortBy, setSortBy] = useState<PackageListingSort>("updated-desc");
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

  const refreshLibrary = useCallback(async (): Promise<void> => {
    const nextDrills = await listDrillsWithActiveVersion(repositoryContext);
    setDrills(nextDrills);
    const versions = await Promise.all(nextDrills.map((item) => listVersionsForDrill(item.drillId, repositoryContext)));
    setVersionsByDrillId(Object.fromEntries(nextDrills.map((item, index) => [item.drillId, versions[index] ?? []])));
  }, [repositoryContext]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

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
    if (!drill.activeReadyVersion) {
      setItemFeedback(`drill:${drill.drillId}`, "Only Ready versions can be published.", "error");
      return;
    }

    await publishVersion(drill.activeReadyVersion, repositoryContext);
    setItemFeedback(`drill:${drill.drillId}`, "Ready version published.");
    await refreshLibrary();
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
    <section style={libraryLayoutStyle}>
      <section className="card" style={headerCardStyle}>
        <h2 style={{ margin: 0 }}>My drills</h2>
        <p className="muted" style={{ margin: 0 }}>
          One library for all drills. Each drill keeps stable identity with version history, Draft/Ready status, and publish state.
        </p>
        <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
          Storage mode: {signedInMode ? "Cloud workspace (hosted drills only)" : "Browser workspace (local drills only)"}
        </p>
        <div style={compactActionRowStyle}>
          <button type="button" style={primaryButtonStyle} disabled={Boolean(pendingActionByItemId["global:create"])} onClick={() => void runItemAction("global:create", "Creating drill…", onCreateDraft)}>
            New drill
          </button>
          <input ref={fileInputRef} type="file" accept="application/json,.json,.cvpkg.json" style={{ display: "none" }} onChange={(event) => void onImportFileChange(event)} />
          <button type="button" style={chipStyle(false)} onClick={() => fileInputRef.current?.click()}>
            Import drill file
          </button>
          <Link href="/marketplace" style={tertiaryLinkStyle}>Browse Drill Exchange</Link>
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
            <p className="muted" style={{ margin: 0 }}>No drills yet. Start with <strong>New drill</strong>.</p>
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
                    <strong>{drill.title}</strong>
                    <p className="muted" style={{ margin: 0 }}>
                      Current released: {drill.activeReadyVersion ? `v${drill.activeReadyVersion.versionNumber}` : "None yet"}
                      {drill.activeReadyVersion?.isPublished ? " • Published" : ""}
                    </p>
                    {drill.openDraftVersion ? <p className="muted" style={{ margin: 0 }}>Open draft for v{drill.openDraftVersion.versionNumber}</p> : null}
                  </div>
                  <p className="muted" style={{ margin: 0 }}>Updated {new Date(drill.updatedAtIso).toLocaleString()}</p>
                  <p className="muted" style={{ margin: 0, fontSize: "0.76rem" }}>
                    Source: {signedInMode ? "Cloud workspace" : "Browser workspace"}
                  </p>

                  <div style={compactActionRowStyle}>
                    <button type="button" style={primaryActionChipStyle} onClick={() => void runItemAction(`upload:${drill.drillId}`, "Opening Upload Video…", () => onOpenWorkflow(drill, "upload"))}>
                      Upload Video
                    </button>
                    <button type="button" style={primaryActionChipStyle} onClick={() => void runItemAction(`live:${drill.drillId}`, "Opening Live Streaming…", () => onOpenWorkflow(drill, "live"))}>
                      Live Streaming
                    </button>
                    <button type="button" style={chipStyle(true)} onClick={() => void runItemAction(`drill:${drill.drillId}`, "Opening Studio…", () => onOpenForEdit(drill))}>
                      Edit in Studio
                    </button>
                    <button
                      type="button"
                      style={chipStyle(false)}
                      aria-expanded={previewDrillId === drill.drillId}
                      onClick={() => setPreviewDrillId((current) => (current === drill.drillId ? null : drill.drillId))}
                    >
                      {previewDrillId === drill.drillId ? "Hide Preview" : "Preview"}
                    </button>
                  </div>
                  {previewDrillId === drill.drillId && previewDrill ? (
                    <section style={previewPanelStyle}>
                      <DrillSelectionPreviewPanel
                        drill={previewDrill}
                        sourceKind={signedInMode ? "hosted" : "local"}
                        showSourceBadge
                        compact
                        quiet
                      />
                    </section>
                  ) : null}

                  <div style={compactActionRowStyle}>
                    <button type="button" style={chipStyle(false)} onClick={() => void runItemAction(`ready:${drill.drillId}`, "Marking ready…", () => onMarkReady(drill))}>
                      Mark Ready
                    </button>
                    <button type="button" style={chipStyle(false)} onClick={() => void runItemAction(`publish:${drill.drillId}`, "Publishing…", () => onPublish(drill))}>
                      Publish
                    </button>
                    <button type="button" style={chipStyle(false)} onClick={() => void runItemAction(`export:${drill.drillId}`, "Exporting drill file…", () => onExportDrillFile(`drill:${drill.drillId}`, drill.activeReadyVersion ?? drill.currentVersion))}>
                      Export drill file
                    </button>
                    <button type="button" style={chipStyle(false)} onClick={() => void runItemAction(`delete:${drill.drillId}`, "Deleting drill…", () => onDeleteDrill(drill))}>
                      Delete
                    </button>
                  </div>

                  <details>
                    <summary style={{ cursor: "pointer" }}>Version history</summary>
                    <div style={{ display: "grid", gap: "0.28rem", marginTop: "0.35rem" }}>
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
                  </details>

                  <details>
                    <summary style={{ cursor: "pointer" }}>Knowledge</summary>
                    <KnowledgeSections knowledge={knowledgeByDrillId[drill.drillId]} titleByDrillId={titleByDrillId} />
                  </details>

                  <InlineItemFeedback itemId={`drill:${drill.drillId}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
                  <InlineItemFeedback itemId={`live:${drill.drillId}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
                  <InlineItemFeedback itemId={`upload:${drill.drillId}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
                  <InlineItemFeedback itemId={`ready:${drill.drillId}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
                  <InlineItemFeedback itemId={`publish:${drill.drillId}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
                  <InlineItemFeedback itemId={`export:${drill.drillId}`} pending={pendingActionByItemId} success={actionMessageByItemId} error={actionErrorByItemId} />
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
const listCardStyle: CSSProperties = { margin: 0, padding: "0.55rem", display: "grid", gap: "0.32rem", background: "linear-gradient(180deg, rgba(19, 28, 42, 0.95), rgba(15, 21, 32, 0.95))" };
const rowTitleWrapStyle: CSSProperties = { display: "grid", gap: "0.15rem" };
const emptyStateStyle: CSSProperties = { margin: 0, border: "1px dashed var(--border)", borderRadius: "0.7rem", padding: "0.55rem", background: "rgba(19, 28, 42, 0.45)" };
const compactActionRowStyle: CSSProperties = { display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" };
const previewPanelStyle: CSSProperties = { marginTop: "0.15rem", width: "min(100%, 460px)" };
const filtersRowStyle: CSSProperties = { display: "flex", gap: "0.45rem", alignItems: "end", flexWrap: "wrap" };
const labelStyle: CSSProperties = { display: "grid", gap: "0.18rem", color: "var(--muted)", fontSize: "0.8rem" };
const inputStyle: CSSProperties = { border: "1px solid var(--border)", borderRadius: "0.52rem", padding: "0.38rem 0.5rem", background: "var(--panel-soft)", color: "var(--text)", width: "100%" };
const primaryButtonStyle: CSSProperties = { ...chipStyle(true), color: "var(--text)", borderColor: "rgba(114, 168, 255, 0.65)", background: "var(--accent-soft)", fontWeight: 600 };
const tertiaryLinkStyle: CSSProperties = { color: "var(--muted)", textDecoration: "none", fontSize: "0.78rem", paddingInline: "0.2rem" };
const noticeBaseStyle: CSSProperties = { margin: 0, fontSize: "0.76rem", borderRadius: "0.45rem", padding: "0.3rem 0.4rem", border: "1px solid" };
const errorNoticeStyle: CSSProperties = { ...noticeBaseStyle, color: "#f6cbcb", borderColor: "rgba(255, 120, 120, 0.55)", background: "rgba(120, 23, 23, 0.3)" };
const successNoticeStyle: CSSProperties = { ...noticeBaseStyle, color: "#d2f5da", borderColor: "rgba(100, 198, 132, 0.55)", background: "rgba(28, 72, 36, 0.33)" };
const primaryActionChipStyle: CSSProperties = { ...chipStyle(true), fontWeight: 600, borderColor: "rgba(114, 168, 255, 0.75)" };
function chipStyle(active: boolean): CSSProperties {
  return { border: `1px solid ${active ? "rgba(114, 168, 255, 0.55)" : "var(--border)"}`, borderRadius: "999px", padding: "0.24rem 0.55rem", fontSize: "0.76rem", color: active ? "var(--text)" : "var(--muted)", background: active ? "rgba(114, 168, 255, 0.12)" : "var(--panel-soft)", cursor: "pointer" };
}
