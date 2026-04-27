"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { DrillVisualPreview } from "@/components/library/DrillVisualPreview";
import {
  findExistingExchangeFork,
  getExchangeModerationAccess,
  listExchangePublications,
  moderateExchangePublication,
  recordExchangeFork,
  updateExchangeForkTarget,
  type ExchangePublication
} from "@/lib/exchange";
import { createDrill, forkPublishedDrillToLibrary, loadEditableVersionForDrill, type DrillRepositoryContext } from "@/lib/library";
import { buildWorkflowDrillKey, setActiveDrillContext } from "@/lib/workflow/drill-context";

const ALL_FILTER = "all";

type CardMetaItem = {
  label: string;
  value: string;
};

function toTitleLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function MarketplaceOverview() {
  const router = useRouter();
  const { session, persistenceMode } = useAuth();
  const [entries, setEntries] = useState<ExchangePublication[]>([]);
  const [searchText, setSearchText] = useState("");
  const [movementType, setMovementType] = useState(ALL_FILTER);
  const [difficulty, setDifficulty] = useState(ALL_FILTER);
  const [category, setCategory] = useState(ALL_FILTER);
  const [pendingAddId, setPendingAddId] = useState<string | null>(null);
  const [pendingModerationPublicationId, setPendingModerationPublicationId] = useState<string | null>(null);
  const [isModerator, setIsModerator] = useState(false);
  const [feedback, setFeedback] = useState<string>("");
  const [warning, setWarning] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [pendingCreateDrill, setPendingCreateDrill] = useState(false);

  const repositoryContext = useMemo<DrillRepositoryContext>(
    () => ({ mode: persistenceMode === "cloud" ? "cloud" : "local", session }),
    [persistenceMode, session]
  );

  const loadPublications = useCallback(async (): Promise<void> => {
    const result = await listExchangePublications({
      searchText,
      movementType,
      difficulty,
      category,
      session
    });

    if (!result.ok) {
      setEntries([]);
      setError(result.error);
      return;
    }

    setError("");
    setEntries(result.value);
  }, [category, difficulty, movementType, searchText, session]);

  useEffect(() => {
    void loadPublications();
  }, [loadPublications]);

  useEffect(() => {
    async function loadAccess() {
      if (!session) {
        setIsModerator(false);
        return;
      }
      const access = await getExchangeModerationAccess();
      setIsModerator(access.ok && access.value.isModerator);
    }
    void loadAccess();
  }, [session]);

  const movementOptions = useMemo(() => [ALL_FILTER, ...new Set(entries.map((entry) => entry.movementType))], [entries]);
  const difficultyOptions = useMemo(() => [ALL_FILTER, ...new Set(entries.map((entry) => entry.difficultyLevel))], [entries]);
  const categoryOptions = useMemo(() => [ALL_FILTER, ...new Set(entries.map((entry) => entry.category))], [entries]);

  async function onAddToLibrary(entry: ExchangePublication): Promise<void> {
    if (!session) {
      setError("Sign in to add this drill to your library.");
      return;
    }

    setPendingAddId(entry.id);
    setFeedback("");
    setWarning("");
    setError("");

    try {
      const existingFork = await findExistingExchangeFork(session, entry.id);
      let staleLineageDetected = false;
      if (!existingFork.ok) {
        setWarning("Could not verify prior Drill Exchange imports. Continuing with add to library.");
      }
      if (existingFork.ok && existingFork.value) {
        const existingEditable = await loadEditableVersionForDrill(existingFork.value.forkedPrivateDrillId, repositoryContext);
        if (existingEditable) {
          router.push(`/library?exchangeAdded=already&title=${encodeURIComponent(entry.title)}`);
          return;
        }
        staleLineageDetected = true;
      }

      const forked = await forkPublishedDrillToLibrary(
        {
          publishedPackage: entry.snapshotPackage,
          publishedDrillId: entry.id
        },
        repositoryContext
      );

      const lineage = await recordExchangeFork(session, {
        publishedDrillId: entry.id,
        forkedPrivateDrillId: forked.drillId
      });

      if (staleLineageDetected || !lineage.ok) {
        const repair = await updateExchangeForkTarget(session, {
          publishedDrillId: entry.id,
          forkedPrivateDrillId: forked.drillId
        });
        if (!repair.ok) {
          setWarning("Drill added, but fork lineage sync is delayed.");
        }
      }

      setActiveDrillContext({ drillId: forked.drillId, sourceKind: persistenceMode === "cloud" ? "hosted" : "local", sourceId: forked.draftVersionId });
      setFeedback(`Added "${entry.title}" to My Drills.`);
      router.push(`/library?exchangeAdded=1&title=${encodeURIComponent(entry.title)}&drillId=${encodeURIComponent(forked.drillId)}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to add drill to My Drills.");
    } finally {
      setPendingAddId(null);
    }
  }

  async function onModeratorRemove(entry: ExchangePublication): Promise<void> {
    const confirmed = window.confirm(`Remove "${entry.title}" from Drill Exchange?`);
    if (!confirmed) return;
    const reason = window.prompt("Optional moderation note (internal only):", "") ?? "";
    setPendingModerationPublicationId(entry.id);
    const result = await moderateExchangePublication(entry.id, { action: "archive", reason });
    setPendingModerationPublicationId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEntries((current) => current.filter((row) => row.id !== entry.id));
    setFeedback(`Removed "${entry.title}" from Drill Exchange.`);
  }

  function onLaunchWorkflow(entry: ExchangePublication, destination: "upload" | "live"): void {
    const drill = entry.snapshotPackage.drills[0];
    if (!drill) {
      return;
    }
    const context = {
      drillId: drill.drillId,
      sourceKind: "exchange" as const,
      sourceId: entry.id
    };
    setActiveDrillContext(context);
    router.push(`/${destination}?drillKey=${encodeURIComponent(buildWorkflowDrillKey(context))}`);
  }

  async function onCreateDrill(): Promise<void> {
    setPendingCreateDrill(true);
    setFeedback("");
    setWarning("");
    setError("");
    try {
      const created = await createDrill(repositoryContext);
      setActiveDrillContext({
        drillId: created.drillId,
        sourceKind: persistenceMode === "cloud" ? "hosted" : "local",
        sourceId: created.draftVersionId
      });
      router.push(`/studio?intent=create&drillId=${encodeURIComponent(created.drillId)}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not start a new drill draft.");
    } finally {
      setPendingCreateDrill(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: "0.5rem", display: "grid", gap: "0.9rem" }}>
      <h2 style={{ margin: 0 }}>Explore Drills</h2>
      <p className="muted" style={{ margin: 0 }}>
        Start from public Drill Exchange drills to train quickly. Launch Upload Video or Live Coaching directly from each drill card.
      </p>
      <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
        Use My Drills for authored drafts, imported drill files, private drills, and advanced editing workflows.
      </p>
      {!session ? (
        <p className="muted" style={{ margin: 0 }}>
          You can browse and launch public drills while signed out. Add to My Drills requires sign-in.
        </p>
      ) : null}
      <div style={helperActionRowStyle}>
        <button type="button" className="pill" style={advancedActionStyle} onClick={() => void onCreateDrill()} disabled={pendingCreateDrill}>
          {pendingCreateDrill ? "Creating draft…" : "Create Drill (advanced)"}
        </button>
        <Link className="pill" href="/library#my-drills" style={secondaryActionStyle}>Open My Drills</Link>
      </div>

      <div style={filtersRowStyle}>
        <label style={{ ...labelStyle, flex: "1 1 280px", minWidth: "min(100%, 280px)" }}>
          <span>Search published drills</span>
          <input value={searchText} onChange={(event) => setSearchText(event.target.value)} style={inputStyle} />
        </label>

        <label style={labelStyle}>
          <span>Movement type</span>
          <select value={movementType} onChange={(event) => setMovementType(event.target.value)} style={inputStyle}>
            {movementOptions.map((option) => (
              <option key={option} value={option}>
                {option === ALL_FILTER ? "All" : option}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          <span>Difficulty</span>
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} style={inputStyle}>
            {difficultyOptions.map((option) => (
              <option key={option} value={option}>
                {option === ALL_FILTER ? "All" : option}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)} style={inputStyle}>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {option === ALL_FILTER ? "All" : option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {entries.length === 0 ? (
        <div className="card" style={{ margin: 0, background: "var(--panel-soft)" }}>
          <p className="muted" style={{ margin: 0 }}>
            No public drills match your current search and filters. Explore Drill Exchange with broader filters to start training quickly.
          </p>
        </div>
      ) : (
        <div style={gridStyle}>
          {entries.map((entry) => {
            const leadDrill = entry.snapshotPackage.drills[0];
            const metadata: CardMetaItem[] = [
              { label: "Movement", value: toTitleLabel(entry.movementType) },
              { label: "Difficulty", value: toTitleLabel(entry.difficultyLevel) },
              { label: "Category", value: toTitleLabel(entry.category) }
            ];

            if (leadDrill?.phases?.length) {
              metadata.push({ label: "Phases", value: String(leadDrill.phases.length) });
            }
            if (entry.cameraView && entry.cameraView !== "unknown") {
              metadata.push({ label: "View", value: toTitleLabel(entry.cameraView) });
            }

            return (
              <article key={entry.id} className="card" style={cardStyle}>
                {leadDrill ? (
                  <DrillVisualPreview
                    drill={leadDrill}
                    assets={entry.snapshotPackage.assets}
                    variant="exchangeCard"
                    showMotionPreview
                    motionMode="badge"
                  />
                ) : null}
                <div style={cardBodyStyle}>
                  <h3 style={{ margin: 0, fontSize: "1rem", lineHeight: 1.3 }}>{entry.title}</h3>
                  <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>By {entry.creatorDisplayName}</p>
                  <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>{entry.shortDescription}</p>

                  <div style={metadataGridStyle}>
                    {metadata.map((item) => (
                      <span key={`${entry.id}-${item.label}`} style={metadataPillStyle}>
                        <strong style={{ fontWeight: 600 }}>{item.label}:</strong> {item.value}
                      </span>
                    ))}
                  </div>

                  {entry.tags.length > 0 ? (
                    <div style={tagRowStyle} aria-label="Drill tags">
                      {entry.tags.map((tag) => (
                        <span key={`${entry.id}-${tag}`} className="pill" style={tagChipStyle}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div style={actionRowStyle}>
                    <button type="button" className="pill" style={primaryActionStyle} onClick={() => onLaunchWorkflow(entry, "upload")}>
                      Upload Video
                    </button>
                    <button type="button" className="pill" style={primaryActionStyle} onClick={() => onLaunchWorkflow(entry, "live")}>
                      Start Live Coaching
                    </button>
                    <button type="button" className="pill" style={secondaryActionStyle} disabled={pendingAddId === entry.id} onClick={() => void onAddToLibrary(entry)}>
                      {pendingAddId === entry.id ? "Adding…" : "Add to My Drills"}
                    </button>
                    <Link className="pill" style={tertiaryActionStyle} href={`/marketplace/${encodeURIComponent(entry.slug)}`}>
                      Preview details
                    </Link>
                    {isModerator ? (
                      <button
                        type="button"
                        className="pill"
                        style={moderatorActionStyle}
                        disabled={pendingModerationPublicationId === entry.id}
                        onClick={() => void onModeratorRemove(entry)}
                      >
                        {pendingModerationPublicationId === entry.id ? "Removing…" : "Remove from Exchange"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {feedback ? <p className="muted" style={{ margin: 0 }}>{feedback}</p> : null}
      {warning ? <p className="muted" style={{ margin: 0, color: "#f3d59b" }}>{warning}</p> : null}
      {error ? <p role="alert" style={{ margin: 0, color: "#f6cbcb" }}>{error}</p> : null}
    </section>
  );
}

const filtersRowStyle: CSSProperties = { display: "flex", gap: "0.45rem", alignItems: "end", flexWrap: "wrap" };
const labelStyle: CSSProperties = { display: "grid", gap: "0.18rem", color: "var(--muted)", fontSize: "0.8rem", minWidth: "160px" };
const inputStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.52rem",
  padding: "0.38rem 0.5rem",
  background: "var(--panel-soft)",
  color: "var(--text)",
  width: "100%"
};

const gridStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))"
};

const cardStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  overflow: "hidden",
  display: "grid",
  gridTemplateRows: "auto 1fr"
};

const cardBodyStyle: CSSProperties = {
  padding: "0.75rem",
  display: "grid",
  gap: "0.5rem",
  alignContent: "start"
};

const metadataGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem"
};

const metadataPillStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "999px",
  padding: "0.18rem 0.52rem",
  fontSize: "0.74rem",
  color: "var(--muted)",
  background: "var(--panel-soft)"
};

const tagRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.35rem"
};

const tagChipStyle: CSSProperties = {
  fontSize: "0.72rem",
  padding: "0.16rem 0.48rem"
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.42rem",
  marginTop: "0.2rem"
};

const helperActionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.42rem"
};

const primaryActionStyle: CSSProperties = {
  background: "var(--accent-soft)",
  borderColor: "rgba(114, 168, 255, 0.6)",
  fontWeight: 600
};

const secondaryActionStyle: CSSProperties = {
  background: "var(--panel)"
};

const tertiaryActionStyle: CSSProperties = {
  background: "var(--panel-soft)",
  color: "var(--muted)"
};

const advancedActionStyle: CSSProperties = {
  background: "var(--panel)",
  color: "var(--muted)",
  borderStyle: "dashed"
};

const moderatorActionStyle: CSSProperties = {
  marginLeft: "auto",
  opacity: 0.8,
  fontSize: "0.74rem"
};
