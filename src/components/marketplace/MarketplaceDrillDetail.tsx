"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  findExistingExchangeFork,
  getExchangePublicationBySlug,
  recordExchangeFork,
  updateExchangeForkTarget,
  type ExchangePublication
} from "@/lib/exchange";
import { forkPublishedDrillToLibrary, loadEditableVersionForDrill, type DrillRepositoryContext } from "@/lib/library";
import { setActiveDrillContext } from "@/lib/workflow/drill-context";

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
  const [pendingFork, setPendingFork] = useState(false);

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

  async function onFork(): Promise<void> {
    if (!entry) {
      return;
    }
    if (!session) {
      setError("Sign in to fork/remix a published drill.");
      return;
    }

    setPendingFork(true);
    setError("");
    setWarning("");
    try {
      const existingFork = await findExistingExchangeFork(session, entry.id);
      if (!existingFork.ok) {
        throw new Error(existingFork.error);
      }
      if (existingFork.value) {
        const existingEditable = await loadEditableVersionForDrill(existingFork.value.forkedPrivateDrillId, repositoryContext);
        if (existingEditable) {
          setActiveDrillContext({
            drillId: existingEditable.drillId,
            sourceKind: persistenceMode === "cloud" ? "hosted" : "local",
            sourceId: existingEditable.sourceId
          });
          router.push(`/studio?drillId=${encodeURIComponent(existingEditable.drillId)}`);
          return;
        }
      }

      const forked = await forkPublishedDrillToLibrary(
        { publishedPackage: entry.snapshotPackage, publishedDrillId: entry.id },
        repositoryContext
      );
      const lineage = await recordExchangeFork(session, {
        publishedDrillId: entry.id,
        forkedPrivateDrillId: forked.drillId
      });
      if (!lineage.ok) {
        const repair = await updateExchangeForkTarget(session, {
          publishedDrillId: entry.id,
          forkedPrivateDrillId: forked.drillId
        });
        if (!repair.ok) {
          setWarning(`Fork lineage sync is delayed: ${lineage.error}`);
        }
      }

      setActiveDrillContext({
        drillId: forked.drillId,
        sourceKind: persistenceMode === "cloud" ? "hosted" : "local",
        sourceId: forked.draftVersionId
      });
      router.push(`/studio?drillId=${encodeURIComponent(forked.drillId)}`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Fork failed.");
    } finally {
      setPendingFork(false);
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

      <button type="button" className="pill" onClick={() => void onFork()} disabled={pendingFork}>
        {pendingFork ? "Forking…" : "Fork / Remix into My Drills"}
      </button>
      {warning ? <p className="muted" style={{ margin: 0, color: "#f3d59b" }}>{warning}</p> : null}
      {error ? <p role="alert" style={{ margin: 0, color: "#f6cbcb" }}>{error}</p> : null}
    </section>
  );
}
