"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import { getPrimaryDrill } from "@/lib/editor/package-editor";
import { useStudioState } from "@/components/studio/StudioState";

export function StudioPublishPanel() {
  const {
    selectedPackage,
    publishWorkflow,
    closePublishPanel,
    runPublishReadinessCheck,
    runMockPublish,
    updatePublishingMetadata
  } = useStudioState();

  const drill = selectedPackage ? getPrimaryDrill(selectedPackage.workingPackage) : null;
  const publishing = selectedPackage?.workingPackage.manifest.publishing;

  const summary = useMemo(() => {
    if (!drill || !selectedPackage) {
      return null;
    }

    return {
      packageId: selectedPackage.workingPackage.manifest.packageId,
      packageVersion: selectedPackage.workingPackage.manifest.packageVersion,
      title: publishing?.title ?? drill.title,
      summary: publishing?.summary ?? drill.description ?? "",
      phaseCount: drill.phases.length
    };
  }, [drill, publishing, selectedPackage]);

  if (!publishWorkflow.panelOpen) {
    return null;
  }

  return (
    <section className="card" style={{ borderColor: "#3f61ad" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
        <h3 style={{ margin: 0 }}>Publish Prep (Local/Mock)</h3>
        <button type="button" style={buttonStyle} onClick={closePublishPanel}>
          Close
        </button>
      </div>
      <p className="muted" style={{ marginTop: "0.5rem" }}>
        Publishing is local/mock only in this PR. Export/download and publish prep remain separate workflows.
      </p>

      {!summary ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          Load a package to begin publish preparation.
        </p>
      ) : (
        <>
          <ul className="muted" style={{ marginTop: 0, paddingLeft: "1rem" }}>
            <li>Package: {summary.packageId}</li>
            <li>Version: {summary.packageVersion}</li>
            <li>Drill phases: {summary.phaseCount}</li>
          </ul>

          <div style={{ display: "grid", gap: "0.45rem" }}>
            <label style={labelStyle}>
              <span>Publish title</span>
              <input
                value={summary.title}
                onChange={(event) => updatePublishingMetadata({ title: event.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              <span>Publish summary</span>
              <textarea
                value={summary.summary}
                onChange={(event) => updatePublishingMetadata({ summary: event.target.value })}
                style={{ ...inputStyle, minHeight: "4rem", resize: "vertical" }}
              />
            </label>
            <label style={labelStyle}>
              <span>Author attribution</span>
              <input
                value={publishing?.authorDisplayName ?? ""}
                onChange={(event) => updatePublishingMetadata({ authorDisplayName: event.target.value })}
                style={inputStyle}
                placeholder="Optional display name"
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
            <button type="button" onClick={runPublishReadinessCheck} style={buttonStyle}>
              Run Readiness Check
            </button>
            <button
              type="button"
              onClick={runMockPublish}
              style={buttonStyle}
              disabled={publishWorkflow.status === "publishing" || publishWorkflow.status === "validating"}
            >
              Publish (Mock Local)
            </button>
          </div>

          <p className="muted" style={{ marginBottom: "0.3rem" }}>
            Status: {publishWorkflow.status} — {publishWorkflow.message}
          </p>

          {publishWorkflow.readiness ? (
            <div style={{ display: "grid", gap: "0.35rem" }}>
              <strong>Readiness checks</strong>
              <p className="muted" style={{ margin: 0 }}>
                Errors: {publishWorkflow.readiness.errors.length} • Warnings: {publishWorkflow.readiness.warnings.length}
              </p>
              <ul style={{ margin: 0, paddingLeft: "1rem" }}>
                {publishWorkflow.readiness.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className="muted">
                    [{issue.severity}] {issue.path}: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {publishWorkflow.lastResult ? (
            <section style={{ marginTop: "0.5rem", borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}>
              <strong>Last mock publish result</strong>
              <ul className="muted" style={{ marginTop: "0.3rem", paddingLeft: "1rem" }}>
                <li>Record: {publishWorkflow.lastResult.recordId}</li>
                <li>Locator: {publishWorkflow.lastResult.locator.uri}</li>
                <li>Published: {new Date(publishWorkflow.lastResult.publishedAtIso).toLocaleString()}</li>
                <li>Artifact checksum: {publishWorkflow.lastResult.artifactChecksumSha256.slice(0, 16)}…</li>
              </ul>
            </section>
          ) : null}

          {publishWorkflow.recentPublishes.length > 0 ? (
            <section style={{ marginTop: "0.5rem", borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}>
              <strong>Recently mock published</strong>
              <ul className="muted" style={{ marginTop: "0.3rem", paddingLeft: "1rem" }}>
                {publishWorkflow.recentPublishes.slice(0, 5).map((publish) => (
                  <li key={publish.recordId}>
                    {publish.recordId} • {publish.metadata.title} • {publish.locator.uri}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}

const buttonStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  background: "var(--panel-elevated)",
  color: "var(--text)",
  padding: "0.4rem 0.6rem",
  cursor: "pointer"
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
  color: "var(--muted)",
  fontSize: "0.83rem"
};

const inputStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.45rem",
  background: "var(--panel-soft)",
  color: "var(--text)",
  padding: "0.4rem"
};
