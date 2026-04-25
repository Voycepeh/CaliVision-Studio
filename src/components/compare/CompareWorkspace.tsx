"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { drawCoachingOverlay, drawPoseOverlay, getNearestPoseFrame } from "@/lib/workflow/pose-overlay";
import { buildCompareWorkspaceModel } from "@/lib/compare/compare-model";
import { readCompareHandoffPayload } from "@/lib/compare/compare-handoff";
import type { PoseFrame } from "@/lib/upload/types";
import type { PortablePose } from "@/lib/schema/contracts";

function toPoseFrame(pose: PortablePose): PoseFrame {
  return {
    timestampMs: pose.timestampMs,
    joints: pose.joints
  };
}

function formatClock(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function resolvePoseDuration(frames: PoseFrame[]): number {
  return frames[frames.length - 1]?.timestampMs ?? 0;
}

export function CompareWorkspace() {
  const router = useRouter();
  const [handoff, setHandoff] = useState(() => readCompareHandoffPayload());
  const [currentMs, setCurrentMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const attemptVideoRef = useRef<HTMLVideoElement | null>(null);
  const benchmarkVideoRef = useRef<HTMLVideoElement | null>(null);
  const attemptCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const benchmarkCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setHandoff(readCompareHandoffPayload());
  }, []);

  const model = useMemo(() => buildCompareWorkspaceModel({
    drill: handoff?.drill,
    analysisSession: handoff?.analysisSession,
    benchmarkFeedback: handoff?.benchmarkFeedback,
    coachingFeedback: handoff?.coachingFeedback
  }), [handoff]);

  const benchmarkFrames = useMemo(() => {
    if (handoff?.benchmarkPoses?.length) {
      return handoff.benchmarkPoses.map(toPoseFrame).sort((a, b) => a.timestampMs - b.timestampMs);
    }
    return [] as PoseFrame[];
  }, [handoff?.benchmarkPoses]);

  const attemptFrames = useMemo(() => handoff?.attemptPoseFrames ?? [], [handoff?.attemptPoseFrames]);

  const durationMs = useMemo(() => {
    const fromSession = handoff?.analysisSession?.summary.analyzedDurationMs ?? 0;
    const fromAttemptFrames = resolvePoseDuration(attemptFrames);
    const fromBenchmarkFrames = resolvePoseDuration(benchmarkFrames);
    return Math.max(fromSession, fromAttemptFrames, fromBenchmarkFrames, 1000);
  }, [attemptFrames, benchmarkFrames, handoff?.analysisSession?.summary.analyzedDurationMs]);

  useEffect(() => {
    if (!isPlaying) return;

    const tick = () => {
      const activeVideo = attemptVideoRef.current ?? benchmarkVideoRef.current;
      if (activeVideo) {
        setCurrentMs(Math.round(activeVideo.currentTime * 1000));
      } else {
        setCurrentMs((prev) => {
          const next = prev + (1000 / 30) * speed;
          if (next >= durationMs) {
            setIsPlaying(false);
            return durationMs;
          }
          return next;
        });
      }
    };

    const id = window.setInterval(tick, 33);
    return () => window.clearInterval(id);
  }, [durationMs, isPlaying, speed]);

  useEffect(() => {
    const draw = (canvas: HTMLCanvasElement | null, frame: PoseFrame | undefined, includeCoaching: boolean) => {
      if (!canvas) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width <= 0 || height <= 0) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      drawPoseOverlay(ctx, width, height, frame);
      if (includeCoaching && handoff?.coachingFeedback) {
        drawCoachingOverlay(ctx, width, height, frame, handoff.coachingFeedback);
      }
    };

    draw(benchmarkCanvasRef.current, getNearestPoseFrame(benchmarkFrames, currentMs), false);
    draw(attemptCanvasRef.current, getNearestPoseFrame(attemptFrames, currentMs), true);
  }, [attemptFrames, benchmarkFrames, currentMs, handoff?.coachingFeedback]);

  const syncTo = (nextMs: number) => {
    const bounded = Math.max(0, Math.min(nextMs, durationMs));
    setCurrentMs(bounded);
    if (attemptVideoRef.current) {
      attemptVideoRef.current.currentTime = bounded / 1000;
    }
    if (benchmarkVideoRef.current) {
      benchmarkVideoRef.current.currentTime = bounded / 1000;
    }
  };

  const togglePlay = async () => {
    if (isPlaying) {
      attemptVideoRef.current?.pause();
      benchmarkVideoRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    if (attemptVideoRef.current) {
      attemptVideoRef.current.playbackRate = speed;
      await attemptVideoRef.current.play().catch(() => undefined);
    }
    if (benchmarkVideoRef.current) {
      benchmarkVideoRef.current.playbackRate = speed;
      await benchmarkVideoRef.current.play().catch(() => undefined);
    }
    setIsPlaying(true);
  };

  const showNoAttemptVisual = !handoff?.attemptVideoUrl && attemptFrames.length === 0;

  return (
    <section style={{ display: "grid", gap: "0.8rem" }}>
      <header className="card" style={{ margin: 0, display: "grid", gap: "0.4rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <p className="muted" style={{ margin: 0 }}>Compare</p>
            <h2 style={{ margin: "0.2rem 0 0" }}>{model.drillLabel}</h2>
          </div>
          <button type="button" className="pill" onClick={() => router.push(handoff?.fromPath ?? "/upload")}>Back to Analysis</button>
        </div>
      </header>

      {model.emptyState ? (
        <article className="card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>{model.emptyState.title}</h3>
          <p className="muted" style={{ marginBottom: 0 }}>{model.emptyState.description}</p>
        </article>
      ) : null}

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: "0.7rem" }}>
        <div style={{ display: "grid", gap: "0.7rem", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
          <article className="card" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0 }}>{model.benchmarkLabel}</h3>
            {handoff?.benchmarkVideoUrl ? (
              <div style={{ position: "relative", aspectRatio: "16/9", background: "#020617" }}>
                <video ref={benchmarkVideoRef} src={handoff.benchmarkVideoUrl} controls={false} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                {benchmarkFrames.length > 0 ? <canvas ref={benchmarkCanvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} /> : null}
              </div>
            ) : benchmarkFrames.length > 0 ? (
              <div>
                <p className="muted" style={{ marginTop: 0 }}>Benchmark pose sequence</p>
                <div style={{ position: "relative", aspectRatio: "16/9", background: "#020617", borderRadius: 12 }}>
                  <canvas ref={benchmarkCanvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
                </div>
              </div>
            ) : (
              <p className="muted" style={{ marginBottom: 0 }}>No benchmark visual source available.</p>
            )}
          </article>

          <article className="card" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0 }}>{model.attemptLabel}</h3>
            {handoff?.attemptVideoUrl ? (
              <div style={{ position: "relative", aspectRatio: "16/9", background: "#020617" }}>
                <video ref={attemptVideoRef} src={handoff.attemptVideoUrl} controls={false} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                {attemptFrames.length > 0 ? <canvas ref={attemptCanvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} /> : null}
              </div>
            ) : attemptFrames.length > 0 ? (
              <div style={{ position: "relative", aspectRatio: "16/9", background: "#020617", borderRadius: 12 }}>
                <canvas ref={attemptCanvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
              </div>
            ) : (
              <p className="muted" style={{ marginBottom: 0 }}>Select an analyzed attempt to compare.</p>
            )}
          </article>

          <aside className="card" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0 }}>Comparison insight</h3>
            <p><strong>Status:</strong> {model.comparisonStatus}</p>
            <p className="muted" style={{ marginTop: "0.2rem" }}>{model.topTakeaway}</p>
            {model.overallMatchScore === undefined ? <p className="muted" style={{ margin: 0 }}>Match score coming soon</p> : null}
            <div style={{ marginTop: "0.5rem" }}>
              <strong>Focus areas</strong>
              <ul style={{ margin: "0.35rem 0 0 1rem" }}>
                {model.focusAreas.map((area) => <li key={area}>{area}</li>)}
              </ul>
            </div>
          </aside>
        </div>

        {!showNoAttemptVisual ? (
          <article className="card" style={{ margin: 0, display: "grid", gap: "0.45rem" }}>
            <strong>Shared replay controls</strong>
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" className="pill" onClick={() => void togglePlay()}>{isPlaying ? "Pause" : "Play"}</button>
              <input
                type="range"
                min={0}
                max={durationMs}
                value={currentMs}
                onChange={(event) => syncTo(Number(event.target.value))}
                style={{ flex: "1 1 220px" }}
              />
              <span className="muted">{formatClock(currentMs)} / {formatClock(durationMs)}</span>
              <label className="muted" style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center" }}>
                Speed
                <select
                  value={speed}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setSpeed(next);
                    if (attemptVideoRef.current) attemptVideoRef.current.playbackRate = next;
                    if (benchmarkVideoRef.current) benchmarkVideoRef.current.playbackRate = next;
                  }}
                >
                  <option value={0.75}>0.75x</option>
                  <option value={1}>1x</option>
                  <option value={1.25}>1.25x</option>
                </select>
              </label>
            </div>
          </article>
        ) : null}
      </section>

      <section className="card" style={{ margin: 0 }}>
        <h3 style={{ marginTop: 0 }}>Metric breakdown</h3>
        {model.metricRows.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #334155", padding: "0.4rem" }}>Metric</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #334155", padding: "0.4rem" }}>Benchmark</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #334155", padding: "0.4rem" }}>Attempt</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #334155", padding: "0.4rem" }}>Difference</th>
                </tr>
              </thead>
              <tbody>
                {model.metricRows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ padding: "0.4rem", color: row.severity === "warning" ? "#f7d58b" : row.severity === "success" ? "#8ce7bf" : "inherit" }}>{row.label}</td>
                    <td style={{ padding: "0.4rem" }}>{row.benchmarkValue}</td>
                    <td style={{ padding: "0.4rem" }}>{row.attemptValue}</td>
                    <td style={{ padding: "0.4rem" }}>{row.differenceValue ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ marginBottom: 0 }}>No computed metrics available for this attempt yet.</p>
        )}
      </section>
    </section>
  );
}
