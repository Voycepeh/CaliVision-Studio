"use client";

import type { RefObject } from "react";
import { useEffect, useState } from "react";
import type { AnalysisViewerModel, AnalysisViewerPhaseTimelineSegment, ViewerSurface } from "@/lib/analysis-viewer/types";
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
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(model.panel.phaseTimelineSegments[0]?.id ?? null);

  useEffect(() => {
    setSelectedSegmentId((current) => {
      if (current && model.panel.phaseTimelineSegments.some((segment) => segment.id === current)) {
        return current;
      }
      return model.panel.phaseTimelineSegments[0]?.id ?? null;
    });
  }, [model.panel.phaseTimelineSegments]);

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

          <AnalysisPhaseTimeline
            segments={model.panel.phaseTimelineSegments}
            currentTimestampMs={model.panel.currentTimestampMs}
            timelineDurationMs={model.panel.timelineDurationMs}
            selectedSegmentId={selectedSegmentId}
            onSelect={(segment) => {
              setSelectedSegmentId(segment.id);
              onPhaseTimelineSelect(segment);
            }}
          />

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
        <p className="analysis-card__label">Overall match</p>
        <p className="analysis-card__body">{benchmark?.value ?? model.panel.benchmarkFeedback?.summaryLabel ?? model.panel.confidenceLabel}</p>
        <p className="analysis-card__meta">Confidence: {model.panel.confidenceLabel}</p>
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
  const [stableAspectRatio, setStableAspectRatio] = useState<number>(() =>
    resolveStableAspectRatio(undefined, [model.mediaAspectRatio])
  );

  useEffect(() => {
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

function AnalysisPhaseTimeline({
  segments,
  currentTimestampMs,
  timelineDurationMs,
  selectedSegmentId,
  onSelect
}: {
  segments: AnalysisViewerPhaseTimelineSegment[];
  currentTimestampMs?: number;
  timelineDurationMs?: number;
  selectedSegmentId: string | null;
  onSelect: (segment: AnalysisViewerPhaseTimelineSegment) => void;
}) {
  if (segments.length === 0) {
    return <p className="muted" style={{ margin: 0 }}>No phase timeline available for this analysis.</p>;
  }

  const maxDuration = Math.max(1, timelineDurationMs ?? 0, ...segments.map((segment) => segment.endMs));
  const playheadPercent = typeof currentTimestampMs === "number"
    ? Math.min(100, Math.max(0, (currentTimestampMs / maxDuration) * 100))
    : null;

  return (
    <section className="analysis-timeline-section">
      <strong>Phase Timeline</strong>
      <div className="analysis-phase-timeline">
        <div className="analysis-phase-timeline__track">
          {segments.map((segment) => (
            <button
              key={segment.id}
              type="button"
              onClick={() => onSelect(segment)}
              className="analysis-phase-segment"
              aria-pressed={selectedSegmentId === segment.id}
              title={segment.interactive ? `Jump to ${segment.label}` : segment.label}
              style={{
                flex: Math.max(1, segment.endMs - segment.startMs)
              }}
            >
              <span className={`analysis-phase-chip ${selectedSegmentId === segment.id ? "is-active" : ""}`}>{segment.label}</span>
            </button>
          ))}
          {playheadPercent !== null ? (
            <span
              aria-hidden
              className="analysis-phase-playhead"
              style={{ left: `${playheadPercent}%` }}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AnalysisAdvancedDetails({ model }: { model: AnalysisViewerModel }) {
  const benchmark = model.panel.benchmarkFeedback;

  return (
    <details className="analysis-advanced-details">
      <summary>Advanced analysis details</summary>
      {benchmark ? (
        <details>
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
      <details>
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
    </details>
  );
}

function AnalysisTechnicalStatusBar({ chips }: { chips: AnalysisViewerModel["technicalStatusChips"] }) {
  return (
    <details style={{ opacity: 0.9 }}>
      <summary className="muted" style={{ cursor: "pointer" }}>Technical status</summary>
      <div style={{ marginTop: "0.35rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        {chips.map((chip) => (
          <span key={chip.id} className="pill" style={{ color: toneColor(chip.tone), opacity: 0.9 }}>
            {chip.label}: {chip.value}
          </span>
        ))}
      </div>
    </details>
  );
}

function AnalysisDownloads({ model }: { model: AnalysisViewerModel }) {
  return (
    <section style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
      {model.recommendedDeliveryLabel ? <span className="muted" style={{ fontSize: "0.8rem", width: "100%" }}>{model.recommendedDeliveryLabel}</span> : null}
      {model.downloads.map((download) => (
        <button key={download.id} type="button" className="pill" onClick={download.onDownload} disabled={download.disabled} title={download.hint} style={{ opacity: download.disabled ? 0.45 : 1 }}>
          {download.label}
        </button>
      ))}
    </section>
  );
}

function AnalysisDiagnosticsAccordion({ sections }: { sections: AnalysisViewerModel["diagnosticsSections"] }) {
  if (!sections.length) return null;
  return (
    <details style={{ opacity: 0.9 }}>
      <summary style={{ cursor: "pointer" }}>Diagnostics</summary>
      {sections.map((section) => (
        <details key={section.id} style={{ marginTop: "0.35rem" }}>
          <summary style={{ cursor: "pointer" }}>{section.title}</summary>
          <ul className="muted" style={{ marginTop: "0.35rem" }}>
            {section.content.map((line, index) => <li key={`${section.id}_${index}`}>{line}</li>)}
          </ul>
        </details>
      ))}
    </details>
  );
}
