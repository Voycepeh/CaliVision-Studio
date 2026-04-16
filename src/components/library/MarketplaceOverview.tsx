"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  findExistingExchangeFork,
  listExchangePublications,
  recordExchangeFork,
  updateExchangeForkTarget,
  type ExchangePublication
} from "@/lib/exchange";
import { forkPublishedDrillToLibrary, loadEditableVersionForDrill, type DrillRepositoryContext } from "@/lib/library";
import { setActiveDrillContext } from "@/lib/workflow/drill-context";

const ALL_FILTER = "all";

export function MarketplaceOverview() {
  const router = useRouter();
  const { session, persistenceMode } = useAuth();
  const [entries, setEntries] = useState<ExchangePublication[]>([]);
  const [searchText, setSearchText] = useState("");
  const [movementType, setMovementType] = useState(ALL_FILTER);
  const [difficulty, setDifficulty] = useState(ALL_FILTER);
  const [category, setCategory] = useState(ALL_FILTER);
  const [pendingAddId, setPendingAddId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>("");
  const [warning, setWarning] = useState<string>("");
  const [error, setError] = useState<string>("");

  const repositoryContext = useMemo<DrillRepositoryContext>(
    () => ({ mode: persistenceMode === "cloud" ? "cloud" : "local", session }),
    [persistenceMode, session]
  );

  useEffect(() => {
    async function load() {
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
    }

    void load();
  }, [searchText, movementType, difficulty, category, session]);

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
      setFeedback(`Added "${entry.title}" to My Library.`);
      router.push(`/library?exchangeAdded=1&title=${encodeURIComponent(entry.title)}&drillId=${encodeURIComponent(forked.drillId)}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to add drill to My Library.");
    } finally {
      setPendingAddId(null);
    }
  }

  return (
    <section className="card" style={{ marginTop: "1rem", display: "grid", gap: "0.7rem" }}>
      <h2 style={{ margin: 0 }}>Drill Exchange</h2>
      <p className="muted" style={{ margin: 0 }}>
        Browse published drills from creators, preview details, then add what you want into My Library.
      </p>

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

      <div style={{ display: "grid", gap: "0.45rem" }}>
        {entries.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No published drills match these filters yet.
          </p>
        ) : (
          entries.map((entry) => (
            <article key={entry.id} className="card" style={{ margin: 0 }}>
              <strong>{entry.title}</strong>
              <p className="muted" style={{ margin: "0.3rem 0" }}>
                {entry.creatorDisplayName} • {entry.movementType} • {entry.difficultyLevel} • {entry.category}
              </p>
              <p className="muted" style={{ margin: 0 }}>{entry.shortDescription}</p>
              <p className="muted" style={{ margin: "0.25rem 0 0" }}>Tags: {entry.tags.join(", ") || "None"}</p>
              <div style={{ marginTop: "0.45rem", display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                <Link className="pill" href={`/marketplace/${encodeURIComponent(entry.slug)}`}>
                  Preview details
                </Link>
                <button type="button" className="pill" disabled={pendingAddId === entry.id} onClick={() => void onAddToLibrary(entry)}>
                  {pendingAddId === entry.id ? "Adding…" : "Add to My Library"}
                </button>
              </div>
            </article>
          ))
        )}
      </div>
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
