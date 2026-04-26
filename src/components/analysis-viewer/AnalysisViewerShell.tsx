"use client";

import React, { type RefObject } from "react";
import type { AnalysisViewerModel, AnalysisViewerPhaseTimelineSegment, ViewerSurface } from "@/lib/analysis-viewer/types";
import { resolveStableAspectRatio } from "@/lib/analysis-viewer/aspect-ratio";
import { buildAnalysisReviewModel, formatAnalysisReviewTime, type AnalysisReviewSource } from "@/lib/analysis-viewer/review-model";
import { formatHoldExitReason } from "@/lib/analysis-viewer/hold-intervals";

type Props = {
  model: AnalysisViewerModel;
  videoRef: RefObject<HTMLVideoElement | null>;
  onSurfaceChange: (surface: ViewerSurface) => void;
  onPhaseTimelineSelect: (segment: AnalysisViewerPhaseTimelineSegment) => void;
  reviewSource: AnalysisReviewSource;
  overlayCanvas?: React.ReactNode;
};

function toneColor(tone?: "neutral" | "success" | "warning" | "danger" | "info"): string | undefined {
  if (tone === "success") return "#8ce7bf";
  if (tone === "warning") return "#f7d58b";
  if (tone === "danger") return "#f2bbbb";
  if (tone === "info") return "#9ac5ff";
  return undefined;
}

export function AnalysisViewerShell({ model, videoRef, onSurfaceChange, onPhaseTimelineSelect, reviewSource, overlayCanvas }: Props) {
  const review = React.useMemo(() => buildAnalysisReviewModel(model, reviewSource), [model, reviewSource]);
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

          <AnalysisMetricGrid model={model} review={review} />

          <AnalysisStructuredList model={model} review={review} onPhaseTimelineSelect={onPhaseTimelineSelect} />
          <AnalysisCoachSection model={model} />

          <AnalysisDownloads model={model} />
          <AnalysisAdvancedDetails model={model} />
        </aside>
      </div>
    </section>
  );
}

function AnalysisCoachSection({ model }: { model: AnalysisViewerModel }) {
  const coaching = model.panel.coachingFeedback;
  if (!coaching) return null;
  const compactMode = model.panel.drillLabel === "Live Streaming" && model.state !== "ready";
  return (
    <section className="analysis-intervals" style={{ gap: "0.45rem" }}>
      <strong>Coach</strong>
      <p className="muted" style={{ margin: 0 }}>{coaching.summaryLabel} · {coaching.summaryDescription}</p>
      {coaching.positives.length > 0 ? (
        <div>
          <strong style={{ fontSize: "0.9rem" }}>What is good here</strong>
          <ul style={{ margin: "0.25rem 0 0.5rem 1rem" }}>
            {coaching.positives.slice(0, 2).map((item) => <li key={item.id}>{item.title}</li>)}
          </ul>
        </div>
      ) : null}
      {coaching.primaryIssue ? (
        <div>
          <strong style={{ fontSize: "0.9rem" }}>What is limiting you</strong>
          <p style={{ margin: "0.25rem 0" }}>{coaching.primaryIssue.description}</p>
          <p className="muted" style={{ margin: 0 }}>Cue: {coaching.primaryIssue.cueText}</p>
        </div>
      ) : null}
      {coaching.orderedFixSteps.length > 0 ? (
        <div>
          <strong style={{ fontSize: "0.9rem" }}>How to fix it</strong>
          <ol style={{ margin: "0.25rem 0 0 1rem" }}>
            {coaching.orderedFixSteps.slice(0, 3).map((step) => <li key={`${step.order}_${step.title}`}>{step.title}: {step.cueText}</li>)}
          </ol>
        </div>
      ) : null}
      {!compactMode && coaching.bodyPartBreakdown.length > 0 ? (
        <div>
          <strong style={{ fontSize: "0.9rem" }}>Biggest technical faults</strong>
          <ul style={{ margin: "0.25rem 0 0 1rem" }}>
            {coaching.bodyPartBreakdown.slice(0, 3).map((item) => <li key={item.bodyPart}><strong>{item.bodyPart}:</strong> {item.correction}</li>)}
          </ul>
        </div>
      ) : null}
      {!compactMode && coaching.mentalModel ? (
        <div>
          <strong style={{ fontSize: "0.9rem" }}>The real cue you need</strong>
          {coaching.mentalModel.avoidThinking ? <p style={{ margin: "0.2rem 0" }}>Avoid: {coaching.mentalModel.avoidThinking}</p> : null}
          <p className="muted" style={{ margin: 0 }}>Think: {coaching.mentalModel.thinkInstead}</p>
        </div>
      ) : null}
    </section>
  );
}

function AnalysisMetricGrid({ model, review }: { model: AnalysisViewerModel; review: ReturnType<typeof buildAnalysisReviewModel> }) {
  const summaryLine = model.panel.feedbackLines[0] ?? "Coach notes not available yet.";
  const detailLine = model.panel.feedbackLines[1] ?? model.panel.benchmarkFeedback?.summaryDescription ?? "Run another analysis for more guidance.";
  const benchmarkMetric = model.panel.summaryMetrics.find((metric) => metric.id === "benchmark_status");
  const benchmarkValue = benchmarkMetric?.value ?? model.panel.benchmarkFeedback?.summaryLabel;

  return (
    <div className="analysis-panel__cards analysis-panel__cards--minimal">
      {benchmarkValue ? (
        <article className="analysis-card">
          <p className="analysis-card__label">Overall match</p>
          <p className="analysis-card__body">{benchmarkValue}</p>
        </article>
      ) : null}
      <article className="analysis-card analysis-card--primary">
        <p className="analysis-card__label">{model.panel.primaryMetricLabel}</p>
        <p className="analysis-card__value">{model.panel.primaryMetricValue}</p>
        {model.panel.primaryMetricDetail ? <p className="analysis-card__meta">{model.panel.primaryMetricDetail}</p> : null}
      </article>

      <article className="analysis-card">
        <p className="analysis-card__label">Review</p>
        <p className="analysis-card__body">{review.summaryLabel}</p>
      </article>

      <article className="analysis-card">
        <p className="analysis-card__label">Duration</p>
        <p className="analysis-card__body">{formatAnalysisReviewTime(review.totalAnalyzedDurationMs)}</p>
        <p className="analysis-card__meta">{review.statusLabel}</p>
      </article>

      <article className="analysis-card">
        <p className="analysis-card__label">Drill</p>
        <p className="analysis-card__body">{review.drillLabel}</p>
      </article>

      <article className="analysis-card analysis-card--summary">
        <p className="analysis-card__label">Analysis summary</p>
        <p className="analysis-card__body" style={{ color: toneColor(model.panel.benchmarkFeedback?.severity) }}>{review.mainCoachingFinding ?? summaryLine}</p>
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

function AnalysisStructuredList({
  model,
  review,
  onPhaseTimelineSelect
}: {
  model: AnalysisViewerModel;
  review: ReturnType<typeof buildAnalysisReviewModel>;
  onPhaseTimelineSelect: (segment: AnalysisViewerPhaseTimelineSegment) => void;
}) {
  const intervals = React.useMemo(() => {
    if (review.movementType === "HOLD") {
      return review.holdEvents.map((hold) => ({
        id: hold.id,
        kind: "hold" as const,
        index: hold.index,
        startMs: hold.startMs,
        endMs: hold.endMs,
        phaseLabel: hold.phaseLabel,
        targetStatus: hold.targetStatus,
        seekTimestampMs: hold.seekTimestampMs
      }));
    }
    return review.repEvents.map((rep) => ({
      id: rep.id,
      kind: "rep" as const,
      index: rep.index,
      startMs: rep.startMs,
      endMs: rep.endMs,
      status: rep.status,
      phaseSequence: rep.phaseSequence,
      failureReason: rep.failureReason,
      seekTimestampMs: rep.seekTimestampMs
    }));
  }, [review]);
  const [showDetails, setShowDetails] = React.useState(false);

  if (review.movementType === "unknown") {
    return <p className="muted" style={{ margin: 0 }}>Freestyle analysis is available, but drill-specific rep/hold review needs a selected drill.</p>;
  }
  if (!intervals.length && review.movementType === "REP") {
    return <p className="muted" style={{ margin: 0 }}>No complete reps were confirmed. Review the phase sequence or try a clearer camera angle.</p>;
  }
  if (!intervals.length && review.movementType === "HOLD") {
    return <p className="muted" style={{ margin: 0 }}>No stable hold was confirmed. Try staying in the target position longer.</p>;
  }

  const isHoldAnalysis = review.movementType === "HOLD";
  const sectionLabel = isHoldAnalysis ? "Hold analysis" : "Rep analysis";
  const itemLabel = isHoldAnalysis ? "holds" : "reps";
  const toggleLabel = showDetails
    ? (isHoldAnalysis ? "Hide hold details" : "Hide rep details")
    : (isHoldAnalysis ? "Show hold details" : "Show rep details");
  const totalDurationMs = model.timelineDurationMs
    ?? model.panel.timelineDurationMs
    ?? Math.max(0, (intervals[intervals.length - 1]?.endMs ?? 0) - (intervals[0]?.startMs ?? 0));
  const currentPhase = model.panel.currentPhaseLabel?.trim();
  const lastPhase = review.phaseEvents[review.phaseEvents.length - 1]?.label;
  const phaseSummary = currentPhase && currentPhase !== "—" && currentPhase !== "Unknown" ? currentPhase : lastPhase;

  return (
    <section className="analysis-intervals">
      <strong>{sectionLabel} · {review.source === "upload" ? "Upload Video" : "Live Coaching"}</strong>
      <div className="analysis-intervals__summary muted">
        <span>{intervals.length} {itemLabel} detected</span>
        {phaseSummary ? <span>{`Current/last phase: ${phaseSummary}`}</span> : null}
        {totalDurationMs > 0 ? <span>{`Analyzed duration: ${formatAnalysisReviewTime(totalDurationMs)}`}</span> : null}
      </div>
      <button type="button" className="analysis-intervals__toggle" onClick={() => setShowDetails((value) => !value)}>{toggleLabel}</button>
      {showDetails ? (
        <div className="analysis-intervals__list">
          {intervals.map((interval) => {
            const durationMs = Math.max(0, interval.endMs - interval.startMs);
            return (
              <article key={interval.id} className="analysis-interval-row">
                <div className="analysis-interval-row__header">
                  <strong>{interval.kind === "hold" ? `Hold ${interval.index}` : `Rep ${interval.index}`}</strong>
                  <span className="analysis-interval-row__duration">{formatAnalysisReviewTime(durationMs)}</span>
                </div>
                <div className="analysis-interval-row__meta muted">
                  <span>Start {formatAnalysisReviewTime(interval.startMs)}</span>
                  <span>End {formatAnalysisReviewTime(interval.endMs)}</span>
                  {interval.kind === "hold" && interval.phaseLabel ? <span>Phase {interval.phaseLabel}</span> : null}
                  {interval.kind === "hold" && interval.targetStatus ? <span>{formatHoldExitReason(interval.targetStatus.replace("Ended: ", ""))}</span> : null}
                  {interval.kind === "rep" ? <span>Status {interval.status}</span> : null}
                  {interval.kind === "rep" && interval.failureReason ? <span>{interval.failureReason}</span> : null}
                </div>
                {interval.kind === "rep" && interval.phaseSequence.length > 0 ? (
                  <ol className="analysis-interval-checkpoints">
                    {interval.phaseSequence.map((phase, checkpointIndex) => (
                      <li key={`${interval.id}_${phase}_${checkpointIndex}`} className="analysis-interval-checkpoint">
                        <span className="analysis-interval-checkpoint__index">Phase {checkpointIndex + 1}</span>
                        <button
                          type="button"
                          className="analysis-interval-checkpoint__jump"
                          onClick={() => {
                            const matchingSegment = model.panel.phaseTimelineSegments.find((segment) => segment.label === phase && segment.startMs >= interval.startMs && segment.startMs <= interval.endMs);
                            if (matchingSegment?.interactive) {
                              onPhaseTimelineSelect(matchingSegment);
                            }
                          }}
                          disabled={!interval.seekTimestampMs}
                          title={phase}
                        >
                          <span>{phase}</span>
                          <span>{formatAnalysisReviewTime(interval.seekTimestampMs ?? interval.startMs)}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
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
