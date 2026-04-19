"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DrillSelectionPreviewPanel } from "@/components/upload/DrillSelectionPreviewPanel";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  findExistingExchangeFork,
  getExchangeModerationAccess,
  getExchangePublicationBySlug,
  moderateExchangePublication,
  recordExchangeFork,
  updateExchangeForkTarget,
  type ExchangeModerationAction,
  type ExchangePublication
} from "@/lib/exchange";
import { forkPublishedDrillToLibrary, loadEditableVersionForDrill, type DrillRepositoryContext } from "@/lib/library";
import { buildWorkflowDrillKey, setActiveDrillContext } from "@/lib/workflow/drill-context";

type Props = {
  slug: string;
};

export function MarketplaceDrillDetail({ slug }: Props) {
  const router = useRouter();
  const { session, persistenceMode } = useAuth();
  const [entry, setEntry] = useState<ExchangePublication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pendingAdd, setPendingAdd] = useState(false);
  const [addedResult, setAddedResult] = useState<{ drillId: string; draftVersionId: string } | null>(null);
  const [isModerator, setIsModerator] = useState(false);
  const [pendingModerationAction, setPendingModerationAction] = useState<ExchangeModerationAction | null>(null);

  const repositoryContext = useMemo<DrillRepositoryContext>(
    () => ({ mode: persistenceMode === "cloud" ? "cloud" : "local", session }),
    [persistenceMode, session]
  );

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await getExchangePublicationBySlug(slug, session);
      if (!result.ok) {
        setEntry(null);
        setError(result.error);
      } else {
        setEntry(result.value);
        setError(result.value ? "" : "This published drill was not found.");
      }
      setLoading(false);
    }

    void load();
  }, [slug, session]);

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

  async function onAddToLibrary(): Promise<void> {
    if (!entry) {
      return;
    }
    if (!session) {
      setError("Sign in to add this drill to your library.");
      return;
    }

    setPendingAdd(true);
    setFeedback("");
    setError("");
    setWarning("");
    try {
      const existingFork = await findExistingExchangeFork(session, entry.id);
      let staleLineageDetected = false;
      if (!existingFork.ok) {
        setWarning("Could not verify prior Drill Exchange imports. Continuing with add to library.");
      }
      if (existingFork.ok && existingFork.value) {
        const existingEditable = await loadEditableVersionForDrill(existingFork.value.forkedPrivateDrillId, repositoryContext);
        if (existingEditable) {
          setActiveDrillContext({
            drillId: existingEditable.drillId,
            sourceKind: persistenceMode === "cloud" ? "hosted" : "local",
            sourceId: existingEditable.sourceId
          });
          setFeedback(`"${entry.title}" is already in your library.`);
          setAddedResult({ drillId: existingEditable.drillId, draftVersionId: existingEditable.versionId });
          return;
        }
        staleLineageDetected = true;
      }

      const forked = await forkPublishedDrillToLibrary(
        { publishedPackage: entry.snapshotPackage, publishedDrillId: entry.id },
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

      setActiveDrillContext({
        drillId: forked.drillId,
        sourceKind: persistenceMode === "cloud" ? "hosted" : "local",
        sourceId: forked.draftVersionId
      });
      setFeedback(`Added "${entry.title}" to My Library.`);
      setAddedResult({ drillId: forked.drillId, draftVersionId: forked.draftVersionId });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Add to My Library failed.");
    } finally {
      setPendingAdd(false);
    }
  }

  async function onModeratorAction(action: ExchangeModerationAction): Promise<void> {
    if (!entry) return;
    const label = action === "hide" ? "Hide publication" : action === "archive" ? "Archive publication" : "Delete publication";
    const confirmed = window.confirm(`${label} for "${entry.title}"?`);
    if (!confirmed) return;

    const reason = window.prompt("Optional moderation note (internal only):", "") ?? "";
    setPendingModerationAction(action);
    const result = await moderateExchangePublication(entry.id, { action, reason });
    setPendingModerationAction(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFeedback(`${label} complete.`);
    setEntry((current) => (current ? { ...current, visibilityStatus: result.value } : current));
    if (result.value !== "published") {
      router.push("/marketplace");
    }
  }

  if (loading) {
    return <p className="muted">Loading published drill…</p>;
  }

  if (!entry) {
    return (
      <section className="card" style={{ marginTop: "1rem", display: "grid", gap: "0.6rem" }}>
        <p className="muted" style={{ margin: 0 }}>{error || "This published drill is unavailable."}</p>
        <Link href="/marketplace" className="pill">Back to Drill Exchange</Link>
      </section>
    );
  }

  const drill = entry.snapshotPackage.drills[0];

  return (
    <section className="card" style={{ marginTop: "1rem", display: "grid", gap: "0.6rem" }}>
      <Link href="/marketplace" className="pill" style={{ width: "fit-content" }}>← Back to Drill Exchange</Link>
      <h2 style={{ margin: 0 }}>{entry.title}</h2>
      <p className="muted" style={{ margin: 0 }}>
        Creator: {entry.creatorDisplayName} • Movement: {entry.movementType} • Difficulty: {entry.difficultyLevel}
      </p>
      <p className="muted" style={{ margin: 0 }}>Category: {entry.category} • Camera view: {entry.cameraView}</p>
      <p className="muted" style={{ margin: 0 }}>Equipment: {entry.equipment || "None"}</p>
      <p className="muted" style={{ margin: 0 }}>Tags: {entry.tags.join(", ") || "None"}</p>
      <p style={{ margin: 0 }}>{entry.fullDescription || entry.shortDescription}</p>

      <details>
        <summary style={{ cursor: "pointer" }}>Phase summary</summary>
        <ol style={{ margin: "0.45rem 0 0", paddingLeft: "1.1rem" }}>
          {(drill?.phases ?? []).map((phase) => (
            <li key={phase.phaseId} className="muted">
              {phase.name} ({phase.durationMs} ms)
            </li>
          ))}
        </ol>
      </details>
      {drill ? <DrillSelectionPreviewPanel drill={drill} compact quiet /> : null}

      <button type="button" className="pill" onClick={() => void onAddToLibrary()} disabled={pendingAdd}>
        {pendingAdd ? "Adding…" : "Add to My Library"}
      </button>
      {isModerator ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
          <button type="button" className="pill" disabled={pendingModerationAction !== null} onClick={() => void onModeratorAction("hide")}>Hide publication</button>
          <button type="button" className="pill" disabled={pendingModerationAction !== null} onClick={() => void onModeratorAction("archive")}>Archive publication</button>
          <button type="button" className="pill" disabled={pendingModerationAction !== null} onClick={() => void onModeratorAction("delete")}>Delete publication</button>
        </div>
      ) : null}
      {addedResult ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
          <button
            type="button"
            className="pill"
            onClick={() => router.push(`/library?exchangeAdded=1&title=${encodeURIComponent(entry.title)}&drillId=${encodeURIComponent(addedResult.drillId)}`)}
          >
            Go to My Library
          </button>
          <button
            type="button"
            className="pill"
            onClick={() => {
              const sourceKind = persistenceMode === "cloud" ? "hosted" : "local";
              const workflowKey = buildWorkflowDrillKey({
                drillId: addedResult.drillId,
                sourceKind,
                sourceId: addedResult.draftVersionId
              });
              router.push(`/studio?drillId=${encodeURIComponent(addedResult.drillId)}&drillKey=${encodeURIComponent(workflowKey)}`);
            }}
          >
            Open in Studio
          </button>
        </div>
      ) : null}
      {feedback ? <p className="muted" style={{ margin: 0 }}>{feedback}</p> : null}
      {warning ? <p className="muted" style={{ margin: 0, color: "#f3d59b" }}>{warning}</p> : null}
      {error ? <p role="alert" style={{ margin: 0, color: "#f6cbcb" }}>{error}</p> : null}
    </section>
  );
}
