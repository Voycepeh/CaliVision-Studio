"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { computeDrillPersonalBests } from "@/lib/history/personal-bests";
import {
  LocalStorageAttemptHistoryRepository,
  resolveAttemptHistoryRepositoryForSession,
  resolveBrowserAttemptHistoryRepository
} from "@/lib/history/repository";
import type { SavedAttemptSummary } from "@/lib/history/types";

function formatAttemptDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function formatPrimaryMetric(attempt: SavedAttemptSummary): string {
  if (attempt.movementType === "REP") {
    return `${attempt.repsCounted ?? 0} reps`;
  }
  if (attempt.movementType === "HOLD") {
    return `${Math.round(attempt.longestHoldSeconds ?? 0)}s longest hold`;
  }
  return `${Math.round(attempt.durationSeconds ?? 0)}s analyzed`;
}

export function HistoryWorkspace() {
  const { session } = useAuth();
  const [attempts, setAttempts] = useState<SavedAttemptSummary[]>([]);
  const [localAttempts, setLocalAttempts] = useState<SavedAttemptSummary[]>([]);
  const [importState, setImportState] = useState<"idle" | "importing" | "success" | "error">("idle");

  useEffect(() => {
    let cancelled = false;

    resolveBrowserAttemptHistoryRepository(session)
      .then((repository) => repository.listRecentAttempts(100))
      .then((value) => {
        if (!cancelled) setAttempts(value);
      })
      .catch(() => {
        if (!cancelled) setAttempts([]);
      });

    const localRepository = new LocalStorageAttemptHistoryRepository();
    localRepository
      .listRecentAttempts(100)
      .then((value) => {
        if (!cancelled) setLocalAttempts(value);
      })
      .catch(() => {
        if (!cancelled) setLocalAttempts([]);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  async function onClearHistory() {
    const repository = await resolveBrowserAttemptHistoryRepository(session);
    await repository.clearAttempts();
    setAttempts([]);
    if (!session) {
      setLocalAttempts([]);
    }
  }

  async function onImportLocalHistory() {
    if (!session || localAttempts.length === 0) {
      return;
    }
    setImportState("importing");

    try {
      const hostedRepository = resolveAttemptHistoryRepositoryForSession(session);
      await Promise.all(localAttempts.map(async (attempt) => hostedRepository.saveAttempt(attempt)));
      const refreshed = await hostedRepository.listRecentAttempts(100);
      setAttempts(refreshed);
      setImportState("success");
    } catch {
      setImportState("error");
    }
  }

  const personalBests = useMemo(() => computeDrillPersonalBests(attempts), [attempts]);
  const isSignedIn = Boolean(session);
  const storageCopy = isSignedIn ? "Saved to your account." : "Saved on this browser/device.";
  const canImportLocalHistory = isSignedIn && localAttempts.length > 0;

  return (
    <section className="card" style={{ margin: 0, display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0 }}>Recent Attempts</h3>
          <p className="muted" style={{ margin: "0.35rem 0 0" }}>
            {storageCopy} Raw videos, annotated videos, and heavy pose/frame traces are not stored.
          </p>
        </div>
        {attempts.length > 0 ? <button type="button" className="pill" onClick={() => void onClearHistory()}>{isSignedIn ? "Clear account history" : "Clear local history"}</button> : null}
      </div>

      {canImportLocalHistory ? (
        <div className="card" style={{ margin: 0, border: "1px solid #334155", display: "grid", gap: "0.5rem" }}>
          <strong>Local history available</strong>
          <p className="muted" style={{ margin: 0 }}>
            You have {localAttempts.length} local attempt{localAttempts.length === 1 ? "" : "s"} on this browser/device. Import is optional and does not delete local data.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="pill" onClick={() => void onImportLocalHistory()} disabled={importState === "importing"}>
              {importState === "importing" ? "Importing…" : "Import local history to account"}
            </button>
            {importState === "success" ? <span className="muted">Import complete.</span> : null}
            {importState === "error" ? <span className="muted">Import failed. Try again.</span> : null}
          </div>
        </div>
      ) : null}

      {attempts.length === 0 ? <p className="muted">No saved attempts yet. Run Upload Video or Live Streaming to start building history.</p> : null}

      {attempts.length > 0 ? (
      <>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {attempts.map((attempt) => (
          <article key={attempt.id} className="card" style={{ margin: 0, border: "1px solid #334155" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
              <strong>{attempt.drillTitle || "Unknown drill"}</strong>
              <span className="muted">{formatAttemptDate(attempt.createdAt)}</span>
            </div>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              {attempt.source === "upload" ? "Upload Video" : "Live Streaming"} · {formatPrimaryMetric(attempt)} · status: {attempt.status}
            </p>
            {attempt.commonFailureReason || attempt.mainFinding ? (
              <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                {attempt.commonFailureReason ?? attempt.mainFinding}
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <div>
        <h4 style={{ margin: "0 0 0.5rem" }}>Personal bests</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "0.65rem" }}>
          {personalBests.map((best) => (
            <article key={`${best.drillId ?? best.drillTitle}`} className="card" style={{ margin: 0, border: "1px solid #334155" }}>
              <strong>{best.drillTitle}</strong>
              <p className="muted" style={{ margin: "0.2rem 0 0" }}>Best reps: {best.bestRepsCounted}</p>
              <p className="muted" style={{ margin: "0.15rem 0 0" }}>Longest hold: {Math.round(best.longestHoldSeconds)}s</p>
              {best.mostRecentAttemptAt ? <p className="muted" style={{ margin: "0.15rem 0 0" }}>Latest: {formatAttemptDate(best.mostRecentAttemptAt)}</p> : null}
            </article>
          ))}
        </div>
      </div>
      </>
      ) : null}
    </section>
  );
}
