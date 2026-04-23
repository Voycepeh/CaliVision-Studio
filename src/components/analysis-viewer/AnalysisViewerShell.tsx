"use client";

import React, { type RefObject } from "react";
import type { AnalysisViewerModel, AnalysisViewerEvent, AnalysisViewerPhaseTimelineSegment, ViewerSurface } from "@/lib/analysis-viewer/types";
import { resolveStableAspectRatio } from "@/lib/analysis-viewer/aspect-ratio";

type Props = {
  model: AnalysisViewerModel;
  videoRef: RefObject<HTMLVideoElement | null>;
  onSurfaceChange: (surface: ViewerSurface) => void;
  onPhaseTimelineSelect: (segment: AnalysisViewerPhaseTimelineSegment) => void;
  overlayCanvas?: React.ReactNode;
};

function toneColor(tone?: "neutral" | "success" | "warning" | "danger" | "info"): string | undefined {
  if (tone === "success") return "#8ce7bf";
  if (tone === "warning") return "#f7d58b";
  if (tone === "danger") return "#f2bbbb";
  if (tone === "info") return "#9ac5ff";
  return undefined;
}

export function AnalysisViewerShell({ model, videoRef, onSurfaceChange, onPhaseTimelineSelect, overlayCanvas }: Props) {
  return (
    <section className="analysis-viewer-shell">
      <div className="analysis-viewer-layout">
        <AnalysisVideoPane
          model={model}
          videoRef={videoRef}
          onSurfaceChange={onSurfaceChange}
          overlayCanvas={overlayCanvas}
        />

        <aside className="analysis-panel">
          <header className="analysis-panel__header">
            <p className="analysis-panel__eyebrow">Analysis</p>
            <h4>{model.panel.drillLabel}</h4>
          </header>

          <AnalysisMetricGrid model={model} />

          <AnalysisStructuredList model={model} onPhaseTimelineSelect={onPhaseTimelineSelect} />

          <AnalysisDownloads model={model} />
          <AnalysisAdvancedDetails model={model} />
        </aside>
      </div>
    </section>
  );
}

function AnalysisMetricGrid({ model }: { model: AnalysisViewerModel }) {
  const benchmark = model.panel.summaryMetrics.find((metric) => metric.id === "benchmark_status");
  const summaryLine = model.panel.feedbackLines[0] ?? "Coach notes not available yet.";
  const detailLine = model.panel.feedbackLines[1] ?? model.panel.benchmarkFeedback?.summaryDescription ?? "Run another analysis for more guidance.";
  const overallMatchValue = benchmark?.value ?? model.panel.benchmarkFeedback?.summaryLabel;
  const hasOverallMatch = Boolean(overallMatchValue);

  return (
    <div className="analysis-panel__cards analysis-panel__cards--minimal">
      <article className="analysis-card analysis-card--primary">
        <p className="analysis-card__label">{model.panel.primaryMetricLabel}</p>
        <p className="analysis-card__value">{model.panel.primaryMetricValue}</p>
        {model.panel.primaryMetricDetail ? <p className="analysis-card__meta">{model.panel.primaryMetricDetail}</p> : null}
      </article>

      <article className="analysis-card">
        <p className="analysis-card__label">Current phase</p>
        <p className="analysis-card__body">{model.panel.currentPhaseLabel}</p>
      </article>

      <article className="analysis-card">
        <p className="analysis-card__label">{hasOverallMatch ? "Overall match" : "Confidence"}</p>
        <p className="analysis-card__body">{hasOverallMatch ? overallMatchValue : model.panel.confidenceLabel}</p>
        {hasOverallMatch ? <p className="analysis-card__meta">Confidence: {model.panel.confidenceLabel}</p> : null}
      </article>

      <article className="analysis-card">
        <p className="analysis-card__label">Drill mode</p>
        <p className="analysis-card__body">{model.panel.movementTypeLabel}</p>
      </article>

      <article className="analysis-card analysis-card--summary">
        <p className="analysis-card__label">Analysis summary</p>
        <p className="analysis-card__body" style={{ color: toneColor(model.panel.benchmarkFeedback?.severity) }}>{summaryLine}</p>
        <p className="analysis-card__meta">{detailLine}</p>
      </article>

      {(model.state !== "ready" || model.warnings.length > 0) ? (
        <div className={model.state === "error" ? "result-preview-warning" : "result-preview-processing"}>
          {model.stateTitle ? <strong>{model.stateTitle}</strong> : null}
          {model.stateDetail ? <p className="muted" style={{ margin: "0.2rem 0 0" }}>{model.stateDetail}</p> : null}
          {model.progress !== undefined ? <progress max={1} value={model.progress} style={{ width: "100%", marginTop: "0.35rem", maxWidth: 360 }} /> : null}
          {model.warnings.map((warning) => <p key={warning} className="muted" style={{ margin: 0 }}>{warning}</p>)}
        </div>
      ) : null}
    </div>
  );
}

function AnalysisVideoPane({
  model,
  videoRef,
  onSurfaceChange,
  overlayCanvas
}: {
  model: AnalysisViewerModel;
  videoRef: RefObject<HTMLVideoElement | null>;
  onSurfaceChange: (surface: ViewerSurface) => void;
  overlayCanvas?: React.ReactNode;
}) {
  const [stableAspectRatio, setStableAspectRatio] = React.useState<number>(() =>
    resolveStableAspectRatio(undefined, [model.mediaAspectRatio])
  );

  React.useEffect(() => {
    setStableAspectRatio((previous) => resolveStableAspectRatio(previous, [model.mediaAspectRatio]));
  }, [model.mediaAspectRatio]);

  return (
    <div className="analysis-video-pane">
      {model.canShowVideo && model.videoUrl ? (
        <div className="analysis-video-stage" style={{ aspectRatio: stableAspectRatio }}>
          <video
            ref={videoRef}
            controls
            src={model.videoUrl}
            playsInline
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (video.videoWidth > 0 && video.videoHeight > 0) {
                setStableAspectRatio((previous) => resolveStableAspectRatio(previous, [video.videoWidth / video.videoHeight]));
              }
            }}
            style={{ width: "100%", height: "100%", objectFit: "contain", background: "#020617" }}
          />
          {overlayCanvas}
        </div>
      ) : (
        <div className="card" style={{ margin: 0, maxWidth: "min(100%, 680px)", justifySelf: "center", textAlign: "center" }}>
          <strong>{model.stateTitle ?? "Replay preview unavailable"}</strong>
          <p className="muted" style={{ margin: "0.35rem 0 0" }}>{model.stateDetail ?? "Complete analysis to unlock replay preview and timeline controls."}</p>
        </div>
      )}
      <div className="analysis-video-actions">
        <div className="analysis-video-surface-toggle">
          {model.surfaces.map((surface) => (
            <button
              key={surface.id}
              type="button"
              disabled={surface.availability !== "ready"}
              className="studio-button"
              style={{ border: "none", borderRadius: 0, background: model.surface === surface.id ? "var(--accent-soft)" : "transparent", opacity: surface.availability === "ready" ? 1 : 0.45 }}
              onClick={() => onSurfaceChange(surface.id)}
              title={surface.description}
            >
              {surface.label}
              {surface.availability === "processing" ? " (Rendering…)" : ""}
            </button>
          ))}
        </div>
        {model.overlayFullscreenAction ? (
          <button type="button" className="pill" onClick={model.overlayFullscreenAction.onToggle}>{model.overlayFullscreenAction.label}</button>
        ) : null}
      </div>
    </div>
  );
}

type AnalysisInterval = {
  id: string;
  kind: "rep" | "hold";
  index: number;
  startMs: number;
  endMs: number;
  checkpoints: Array<{ id: string; label: string; timestampMs: number }>;
};

function AnalysisStructuredList({
  model,
  onPhaseTimelineSelect
}: {
  model: AnalysisViewerModel;
  onPhaseTimelineSelect: (segment: AnalysisViewerPhaseTimelineSegment) => void;
}) {
  const intervals = React.useMemo(() => buildStructuredIntervals(model), [model]);

  if (!intervals.length) {
    return <p className="muted" style={{ margin: 0 }}>No structured intervals available for this analysis yet.</p>;
  }

  return (
    <section className="analysis-intervals">
      <strong>{intervals[0]?.kind === "hold" ? "Hold analysis" : "Rep analysis"}</strong>
      <div className="analysis-intervals__list">
        {intervals.map((interval) => {
          const durationMs = Math.max(0, interval.endMs - interval.startMs);
          return (
            <article key={interval.id} className="analysis-interval-row">
              <div className="analysis-interval-row__header">
                <strong>{interval.kind === "hold" ? `Hold ${interval.index}` : `Rep ${interval.index}`}</strong>
                <span className="analysis-interval-row__duration">{formatClockDuration(durationMs)}</span>
              </div>
              <div className="analysis-interval-row__meta muted">
                <span>Start {formatClockDuration(interval.startMs)}</span>
                <span>End {formatClockDuration(interval.endMs)}</span>
              </div>
              {interval.checkpoints.length > 0 ? (
                <ol className="analysis-interval-checkpoints">
                  {interval.checkpoints.map((checkpoint, checkpointIndex) => (
                    <li key={checkpoint.id} className="analysis-interval-checkpoint">
                      <span className="analysis-interval-checkpoint__index">Phase {checkpointIndex + 1}</span>
                      <button
                        type="button"
                        className="analysis-interval-checkpoint__jump"
                        onClick={() => {
                          const matchingSegment = model.panel.phaseTimelineSegments.find((segment) => segment.id === checkpoint.id);
                          if (matchingSegment?.interactive) {
                            onPhaseTimelineSelect(matchingSegment);
                          }
                        }}
                        disabled={!model.panel.phaseTimelineSegments.find((segment) => segment.id === checkpoint.id)?.interactive}
                        title={checkpoint.label}
                      >
                        <span>{checkpoint.label}</span>
                        <span>{formatClockDuration(checkpoint.timestampMs)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function buildStructuredIntervals(model: AnalysisViewerModel): AnalysisInterval[] {
  const movementLabel = model.panel.movementTypeLabel.toLowerCase();
  if (movementLabel.includes("hold")) {
    return buildHoldIntervals(model.timelineEvents, model.panel.phaseTimelineSegments);
  }
  return buildRepIntervals(model.timelineEvents, model.panel.phaseTimelineSegments);
}

function buildRepIntervals(events: AnalysisViewerEvent[], segments: AnalysisViewerPhaseTimelineSegment[]): AnalysisInterval[] {
  const completedReps = events
    .filter((event) => event.kind === "rep")
    .map((event) => Math.max(0, Math.round(event.timestampMs)))
    .sort((a, b) => a - b);

  if (completedReps.length === 0) return [];

  const fallbackStart = segments[0]?.startMs ?? 0;
  return completedReps.map((endMs, index) => {
    const startMs = index === 0 ? fallbackStart : completedReps[index - 1] ?? fallbackStart;
    const checkpoints = segments
      .filter((segment) => segment.startMs >= startMs && segment.startMs <= endMs)
      .map((segment) => ({ id: segment.id, label: segment.label, timestampMs: segment.startMs }));
    return {
      id: `rep_${index + 1}_${startMs}_${endMs}`,
      kind: "rep",
      index: index + 1,
      startMs,
      endMs,
      checkpoints
    };
  });
}

function buildHoldIntervals(events: AnalysisViewerEvent[], segments: AnalysisViewerPhaseTimelineSegment[]): AnalysisInterval[] {
  const holdStarts = events
    .filter((event) => event.kind === "hold" && event.label.includes("hold_start"))
    .map((event) => Math.max(0, Math.round(event.timestampMs)))
    .sort((a, b) => a - b);
  const holdEnds = events
    .filter((event) => event.kind === "hold" && event.label.includes("hold_end"))
    .map((event) => Math.max(0, Math.round(event.timestampMs)))
    .sort((a, b) => a - b);

  const intervals: AnalysisInterval[] = [];
  let endCursor = 0;
  holdStarts.forEach((startMs, index) => {
    const endIndex = holdEnds.findIndex((candidate, candidateIndex) => candidateIndex >= endCursor && candidate >= startMs);
    if (endIndex === -1) return;
    const endMs = holdEnds[endIndex]!;
    endCursor = endIndex + 1;
    const checkpoints = segments
      .filter((segment) => segment.startMs >= startMs && segment.startMs <= endMs)
      .map((segment) => ({ id: segment.id, label: segment.label, timestampMs: segment.startMs }));
    intervals.push({
      id: `hold_${index + 1}_${startMs}_${endMs}`,
      kind: "hold",
      index: index + 1,
      startMs,
      endMs,
      checkpoints
    });
  });

  return intervals;
}

function formatClockDuration(durationMs: number): string {
  return new Date(Math.max(0, durationMs)).toISOString().slice(11, 19);
}

function AnalysisAdvancedDetails({ model }: { model: AnalysisViewerModel }) {
  const benchmark = model.panel.benchmarkFeedback;

  return (
    <section className="analysis-advanced-details">
      {benchmark ? (
        <details className="analysis-advanced-details__group">
          <summary>Benchmark reasoning</summary>
          <p className="analysis-card__meta">{benchmark.summaryDescription}</p>
          {benchmark.findings.length > 0 ? (
            <ul className="analysis-details-list">
              {benchmark.findings.map((finding) => (
                <li key={finding.id}>
                  <strong>{finding.title}:</strong> {finding.description}
                </li>
              ))}
            </ul>
          ) : null}
          {benchmark.nextSteps.length > 0 ? <p className="analysis-card__meta">Next: {benchmark.nextSteps.join(" ")}</p> : null}
        </details>
      ) : null}
      <details className="analysis-advanced-details__group">
        <summary>Metrics detail</summary>
        <div className="analysis-summary-metrics">
          {model.panel.summaryMetrics.map((metric) => (
            <div key={metric.id} className="analysis-summary-metric">
              <span>{metric.label}</span>
              <strong style={{ opacity: metric.placeholder ? 0.75 : 1 }}>{metric.value}</strong>
            </div>
          ))}
        </div>
      </details>
      {model.technicalStatusChips.length > 0 ? <AnalysisTechnicalStatusBar chips={model.technicalStatusChips} /> : null}
      <AnalysisDiagnosticsAccordion sections={model.diagnosticsSections} />
    </section>
  );
}

function AnalysisTechnicalStatusBar({ chips }: { chips: AnalysisViewerModel["technicalStatusChips"] }) {
  return (
    <details className="analysis-compact-group">
      <summary className="analysis-compact-summary muted">Technical status</summary>
      <div style={{ marginTop: "0.3rem", display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
        {chips.map((chip) => (
          <span key={chip.id} className="analysis-compact-chip" style={{ color: toneColor(chip.tone), opacity: 0.9 }}>
            {chip.label}: {chip.value}
          </span>
        ))}
      </div>
    </details>
  );
}

function AnalysisDownloads({ model }: { model: AnalysisViewerModel }) {
  return (
    <section className="analysis-downloads">
      {model.recommendedDeliveryLabel ? <span className="analysis-downloads__label muted">{model.recommendedDeliveryLabel}</span> : null}
      {model.downloads.map((download) => (
        <button key={download.id} type="button" className="analysis-downloads__button" onClick={download.onDownload} disabled={download.disabled} title={download.hint} style={{ opacity: download.disabled ? 0.45 : 1 }}>
          {download.label}
        </button>
      ))}
    </section>
  );
}

function AnalysisDiagnosticsAccordion({ sections }: { sections: AnalysisViewerModel["diagnosticsSections"] }) {
  if (!sections.length) return null;
  return (
    <details className="analysis-diagnostics analysis-compact-group">
      <summary className="analysis-diagnostics__summary analysis-compact-summary">Diagnostics</summary>
      {sections.map((section) => (
        <details key={section.id} className="analysis-diagnostics__section analysis-compact-subgroup">
          <summary className="analysis-diagnostics__summary analysis-compact-summary">{section.title}</summary>
          <ul className="analysis-diagnostics__list muted">
            {section.content.map((line, index) => <li key={`${section.id}_${index}`}>{line}</li>)}
          </ul>
        </details>
      ))}
    </details>
  );
}
