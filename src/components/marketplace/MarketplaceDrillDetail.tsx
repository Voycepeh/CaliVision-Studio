"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DrillVisualPreview } from "@/components/library/DrillVisualPreview";
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
      setError("Sign in to add this drill to My Drills.");
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
        setWarning("Could not verify prior Drill Exchange imports. Continuing with add to My Drills.");
      }
      if (existingFork.ok && existingFork.value) {
        const existingEditable = await loadEditableVersionForDrill(existingFork.value.forkedPrivateDrillId, repositoryContext);
        if (existingEditable) {
          setActiveDrillContext({
            drillId: existingEditable.drillId,
            sourceKind: persistenceMode === "cloud" ? "hosted" : "local",
            sourceId: existingEditable.sourceId
          });
          setFeedback(`"${entry.title}" is already in My Drills.`);
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
      setFeedback(`Added "${entry.title}" to My Drills.`);
      setAddedResult({ drillId: forked.drillId, draftVersionId: forked.draftVersionId });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Add to My Drills failed.");
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
  const publicationId = entry.id;
  const exchangeDrillKey = drill ? `exchange:${publicationId}:${drill.drillId}` : null;
  const movementLabel = drill?.drillType === "hold" ? "Hold" : "Rep";
  const difficultyLabel = drill?.difficulty ? `${drill.difficulty[0]?.toUpperCase() ?? ""}${drill.difficulty.slice(1)}` : "—";
  const viewLabel = drill?.primaryView ? `${drill.primaryView[0]?.toUpperCase() ?? ""}${drill.primaryView.slice(1)}` : "—";
  const benchmarkPhaseCount = drill?.benchmark?.phaseSequence?.length ?? 0;
  const hasBenchmarkTiming = Boolean(
    drill?.benchmark?.timing?.expectedRepDurationMs
    || drill?.benchmark?.timing?.targetHoldDurationMs
    || (drill?.benchmark?.timing?.phaseDurationsMs && Object.keys(drill.benchmark.timing.phaseDurationsMs).length > 0)
  );

  function launchWorkflow(destination: "/upload" | "/live"): void {
    if (!drill || !exchangeDrillKey) {
      return;
    }
    setActiveDrillContext({
      drillId: drill.drillId,
      sourceKind: "exchange",
      sourceId: publicationId
    });
    router.push(`${destination}?drillKey=${encodeURIComponent(exchangeDrillKey)}`);
  }

  return (
    <section className="card" style={{ marginTop: "1rem", display: "grid", gap: "0.75rem" }}>
      <Link href="/marketplace" className="pill" style={{ width: "fit-content" }}>← Back to Drill Exchange</Link>
      <article style={{ display: "grid", gap: "0.7rem" }}>
        <h2 style={{ margin: 0 }}>{entry.title}</h2>
        {drill ? <DrillVisualPreview drill={drill} assets={entry.snapshotPackage.assets} variant="exchangeHero" showMotionPreview motionMode="badge" /> : null}
        <p className="muted" style={{ margin: 0 }}>{entry.shortDescription}</p>
        <p style={{ margin: 0 }}>{entry.fullDescription || entry.shortDescription}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }} aria-label="Drill summary">
          <span className="pill">By {entry.creatorDisplayName}</span>
          <span className="pill">Movement: {movementLabel}</span>
          <span className="pill">Difficulty: {difficultyLabel}</span>
          <span className="pill">View: {viewLabel}</span>
          <span className="pill">Category: {entry.category}</span>
          {entry.equipment ? <span className="pill">Equipment: {entry.equipment}</span> : null}
        </div>
        {entry.tags.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }} aria-label="Drill tags">
            {entry.tags.map((tag) => (
              <span key={tag} className="pill">{tag}</span>
            ))}
          </div>
        ) : null}
      </article>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
        <button type="button" className="pill" style={{ background: "var(--accent-soft)", borderColor: "rgba(114, 168, 255, 0.6)", fontWeight: 600 }} onClick={() => launchWorkflow("/upload")} disabled={!drill}>
          Upload video with this drill
        </button>
        <button type="button" className="pill" style={{ background: "var(--accent-soft)", borderColor: "rgba(114, 168, 255, 0.6)", fontWeight: 600 }} onClick={() => launchWorkflow("/live")} disabled={!drill}>
          Start live coaching
        </button>
        <button type="button" className="pill" style={{ background: "var(--panel-soft)", color: "var(--muted)" }} onClick={() => void onAddToLibrary()} disabled={pendingAdd}>
          {pendingAdd ? "Adding…" : "Add to My Drills"}
        </button>
      </div>

      <details>
        <summary style={{ cursor: "pointer" }}>Advanced details</summary>
        <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.45rem" }}>
          <p className="muted" style={{ margin: 0 }}>Benchmark phases: {benchmarkPhaseCount}</p>
          <p className="muted" style={{ margin: 0 }}>Benchmark timing: {hasBenchmarkTiming ? "Available" : "Not provided"}</p>
          <p className="muted" style={{ margin: 0 }}>Package version: {entry.snapshotPackage.manifest.packageVersion}</p>
          <ol style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {(drill?.phases ?? []).map((phase) => (
              <li key={phase.phaseId} className="muted">
                {phase.name} ({phase.durationMs} ms)
              </li>
            ))}
          </ol>
        </div>
      </details>

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
            Go to My Drills
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
