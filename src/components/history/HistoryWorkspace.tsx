"use client";

import { useEffect, useMemo, useState } from "react";
import { computeDrillPersonalBests } from "@/lib/history/personal-bests";
import { getBrowserAttemptHistoryRepository } from "@/lib/history/repository";
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
  const [attempts, setAttempts] = useState<SavedAttemptSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    getBrowserAttemptHistoryRepository()
      .listRecentAttempts(100)
      .then((value) => {
        if (!cancelled) setAttempts(value);
      })
      .catch(() => {
        if (!cancelled) setAttempts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const personalBests = useMemo(() => computeDrillPersonalBests(attempts), [attempts]);

  if (attempts.length === 0) {
    return <p className="muted">No saved attempts yet. Run Upload Video or Live Coaching to start building history.</p>;
  }

  return (
    <section className="card" style={{ margin: 0, display: "grid", gap: "1rem" }}>
      <div>
        <h3 style={{ margin: 0 }}>Recent Attempts</h3>
        <p className="muted" style={{ margin: "0.35rem 0 0" }}>Private to this browser/device. Heavy media is not stored in history.</p>
      </div>

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {attempts.map((attempt) => (
          <article key={attempt.id} className="card" style={{ margin: 0, border: "1px solid #334155" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
              <strong>{attempt.drillTitle || "Unknown drill"}</strong>
              <span className="muted">{formatAttemptDate(attempt.createdAt)}</span>
            </div>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              {attempt.source === "upload" ? "Upload Video" : "Live Coaching"} · {formatPrimaryMetric(attempt)} · status: {attempt.status}
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
    </section>
  );
}
