"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { resolveBrowserAttemptHistoryRepository } from "@/lib/history/repository";
import type { SavedAttemptSummary } from "@/lib/history/types";

function formatAttemptDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function formatSeconds(value?: number): string {
  return `${Math.round(value ?? 0)}s`;
}

export function AttemptDetailWorkspace({ attemptId }: { attemptId: string }) {
  const { session } = useAuth();
  const router = useRouter();
  const [attempt, setAttempt] = useState<SavedAttemptSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    resolveBrowserAttemptHistoryRepository(session)
      .then((repo) => repo.getAttempt(attemptId))
      .then((value) => {
        if (!cancelled) setAttempt(value);
      })
      .catch(() => {
        if (!cancelled) setAttempt(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attemptId, session]);

  const compareLinks = useMemo(() => {
    if (!attempt) return null;
    const base = `/compare?attemptId=${encodeURIComponent(attempt.id)}`;
    return {
      base,
      latest: attempt.drillId ? `${base}&drillId=${encodeURIComponent(attempt.drillId)}&compareTo=latest` : null,
      personalBest: attempt.drillId ? `${base}&drillId=${encodeURIComponent(attempt.drillId)}&compareTo=personalBest` : null
    };
  }, [attempt]);

  async function onDeleteAttempt() {
    const repository = await resolveBrowserAttemptHistoryRepository(session);
    await repository.deleteAttempt(attemptId);
    router.push("/history");
  }

  if (loading) {
    return <section className="card" style={{ margin: 0 }}><p className="muted" style={{ margin: 0 }}>Loading attempt…</p></section>;
  }

  if (!attempt) {
    return (
      <section className="card" style={{ margin: 0, display: "grid", gap: "0.6rem" }}>
        <h3 style={{ margin: 0 }}>Attempt not found</h3>
        <p className="muted" style={{ margin: 0 }}>This attempt may have been deleted or is not available in the current storage mode.</p>
        <div><Link className="pill" href="/history">Back to History</Link></div>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: "0.8rem" }}>
      <article className="card" style={{ margin: 0, display: "grid", gap: "0.55rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>{attempt.drillTitle}</h3>
          <span className="muted">{formatAttemptDate(attempt.createdAt)}</span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {attempt.source === "upload" ? "Upload Video" : "Live Streaming"} · status: {attempt.status}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "0.5rem" }}>
          <p style={{ margin: 0 }}><strong>Movement type:</strong> {attempt.movementType}</p>
          <p style={{ margin: 0 }}><strong>Key metric:</strong> {attempt.movementType === "HOLD" ? `${formatSeconds(attempt.longestHoldSeconds)} longest hold` : `${attempt.repsCounted ?? 0} reps`}</p>
          {attempt.movementType === "REP" ? <p style={{ margin: 0 }}><strong>Reps:</strong> {attempt.repsCounted ?? 0} counted / {attempt.repsIncomplete ?? 0} incomplete</p> : null}
          {attempt.movementType === "HOLD" ? <p style={{ margin: 0 }}><strong>Hold:</strong> {formatSeconds(attempt.longestHoldSeconds)} longest / {formatSeconds(attempt.totalHoldSeconds)} total</p> : null}
          <p style={{ margin: 0 }}><strong>Duration analyzed:</strong> {formatSeconds(attempt.durationSeconds)}</p>
          <p style={{ margin: 0 }}><strong>Model version:</strong> {attempt.analysisModelVersion}</p>
        </div>

        <p style={{ margin: 0 }}><strong>Main finding:</strong> {attempt.mainFinding ?? "No summary finding captured."}</p>
        <p style={{ margin: 0 }}><strong>Common failure reason:</strong> {attempt.commonFailureReason ?? "No common failure reason captured."}</p>
      </article>

      <article className="card" style={{ margin: 0, display: "grid", gap: "0.5rem" }}>
        <h4 style={{ margin: 0 }}>Compare handoff</h4>
        {compareLinks ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <Link className="pill" href={compareLinks.base}>Compare this attempt</Link>
            {compareLinks.latest ? <Link className="pill" href={compareLinks.latest}>Compare against latest</Link> : null}
            {compareLinks.personalBest ? <Link className="pill" href={compareLinks.personalBest}>Compare against personal best</Link> : null}
          </div>
        ) : null}
      </article>

      <article className="card" style={{ margin: 0, display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <Link href="/history" className="pill">Back to History</Link>
        <button type="button" className="pill" onClick={() => void onDeleteAttempt()}>{session ? "Delete hosted attempt" : "Delete local attempt"}</button>
      </article>
    </section>
  );
}
