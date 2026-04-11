"use client";

import type { RefObject } from "react";
import { useEffect, useState } from "react";
import type { AnalysisViewerModel, AnalysisViewerEvent, ViewerSurface } from "@/lib/analysis-viewer/types";
import { resolveStableAspectRatio } from "@/lib/analysis-viewer/aspect-ratio";

type Props = {
  model: AnalysisViewerModel;
  videoRef: RefObject<HTMLVideoElement | null>;
  onSurfaceChange: (surface: ViewerSurface) => void;
  onEventSelect: (event: AnalysisViewerEvent) => void;
  overlayCanvas?: React.ReactNode;
};

function toneColor(tone?: "neutral" | "success" | "warning" | "danger"): string | undefined {
  if (tone === "success") return "#8ce7bf";
  if (tone === "warning") return "#f7d58b";
  if (tone === "danger") return "#f2bbbb";
  return undefined;
}

export function AnalysisViewerShell({ model, videoRef, onSurfaceChange, onEventSelect, overlayCanvas }: Props) {
  return (
    <section style={{ display: "grid", gap: "0.6rem" }}>
      {model.summaryChips.length > 0 ? (
        <AnalysisSummaryBar chips={model.summaryChips} />
      ) : null}

      {(model.state !== "ready" || model.warnings.length > 0) ? (
        <div className={model.state === "error" ? "result-preview-warning" : "result-preview-processing"}>
          {model.stateTitle ? <strong>{model.stateTitle}</strong> : null}
          {model.stateDetail ? <p className="muted" style={{ margin: "0.2rem 0 0" }}>{model.stateDetail}</p> : null}
          {model.progress !== undefined ? <progress max={1} value={model.progress} style={{ width: "100%", marginTop: "0.35rem", maxWidth: 360 }} /> : null}
          {model.warnings.map((warning) => <p key={warning} className="muted" style={{ margin: 0 }}>{warning}</p>)}
        </div>
      ) : null}

      <AnalysisVideoPane
        model={model}
        videoRef={videoRef}
        onSurfaceChange={onSurfaceChange}
        overlayCanvas={overlayCanvas}
      />

      <AnalysisTimeline model={model} onEventSelect={onEventSelect} />
      <AnalysisDownloads model={model} />
      <AnalysisDiagnosticsAccordion sections={model.diagnosticsSections} />
    </section>
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
    <div style={{ display: "grid", gap: "0.5rem" }}>
      {model.canShowVideo && model.videoUrl ? (
        <div style={{ position: "relative", width: "100%", minHeight: "180px", maxWidth: "min(100%, 1100px)", maxHeight: "72vh", aspectRatio: stableAspectRatio, borderRadius: "0.6rem", overflow: "hidden" }}>
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
      ) : null}
      <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: "999px", overflow: "hidden" }}>
          {model.surfaces.map((surface) => (
            <button
              key={surface.id}
              type="button"
              disabled={!surface.available}
              className="studio-button"
              style={{ border: "none", borderRadius: 0, background: model.surface === surface.id ? "var(--accent-soft)" : "transparent", opacity: surface.available ? 1 : 0.45 }}
              onClick={() => onSurfaceChange(surface.id)}
            >
              {surface.label}
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

function AnalysisTimeline({ model, onEventSelect }: { model: AnalysisViewerModel; onEventSelect: (event: AnalysisViewerEvent) => void }) {
  if (!model.timelineEvents.length) {
    return <p className="muted" style={{ margin: 0 }}>No timeline events available for this result.</p>;
  }
  const duration = Math.max(1, model.timelineDurationMs ?? model.timelineEvents.at(-1)?.timestampMs ?? 1);
  return (
    <section style={{ display: "grid", gap: "0.45rem" }}>
      <strong>Timeline</strong>
      <div style={{ position: "relative", height: "1.2rem", border: "1px solid var(--border)", borderRadius: "999px", background: "rgba(255,255,255,0.08)" }}>
        {model.timelineEvents.map((event) => {
          const leftPercent = (event.timestampMs / duration) * 100;
          const color = event.kind === "rep" ? "#9b9dff" : event.kind === "hold" ? "#8ce7bf" : event.kind === "phase" ? "#f7d58b" : "#fff";
          return (
            <button
              key={event.id}
              type="button"
              title={event.label}
              disabled={event.seekable === false}
              onClick={() => onEventSelect(event)}
              style={{ position: "absolute", left: `${Math.min(99, Math.max(1, leftPercent))}%`, top: "50%", transform: "translate(-50%, -50%)", width: "0.7rem", height: "0.7rem", borderRadius: "999px", border: 0, background: color, opacity: event.seekable === false ? 0.4 : 1 }}
            />
          );
        })}
      </div>
    </section>
  );
}

function AnalysisSummaryBar({ chips }: { chips: AnalysisViewerModel["summaryChips"] }) {
  return <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>{chips.map((chip) => <div key={chip.id} className="pill" style={{ color: toneColor(chip.tone) }}>{chip.label}: {chip.value}</div>)}</div>;
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
