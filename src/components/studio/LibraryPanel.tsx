"use client";

import { getSortedPhases, getPrimaryDrill } from "@/lib/editor/package-editor";
import { summarizeProvenance } from "@/lib/package";
import { SAMPLE_PACKAGE_DEFINITIONS } from "@/lib/package";
import { useStudioState } from "@/components/studio/StudioState";

export function LibraryPanel() {
  const { packages, selectedPackageKey, selectPackage, loadSampleById, importFeedback } = useStudioState();

  return (
    <div className="panel-content studio-scrollable-panel" style={{ display: "grid", gap: "0.55rem", alignContent: "start" }}>
      <h2 style={{ marginTop: 0, marginBottom: "0.2rem" }}>Drill source</h2>
      <p className="muted" style={{ marginTop: 0, marginBottom: "0.2rem" }}>
        Choose the drill draft you are editing, load starter samples, and review drill-file import feedback.
      </p>

      <section className="card" style={{ padding: "0.6rem" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.45rem", fontSize: "0.92rem" }}>Starter samples</h3>
        <div style={{ display: "grid", gap: "0.4rem" }}>
          {SAMPLE_PACKAGE_DEFINITIONS.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => loadSampleById(sample.id)}
              className="studio-library-item-button"
              style={{
                textAlign: "left",
                border: "1px solid var(--border)",
                borderRadius: "0.6rem",
                background: "var(--panel-soft)",
                color: "var(--text)",
                padding: "0.45rem",
                cursor: "pointer"
              }}
            >
              <strong className="studio-library-item-title" style={{ display: "block", marginBottom: "0.15rem" }}>
                {sample.label}
              </strong>
              <small className="muted studio-library-item-subline">{sample.description}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: "0.6rem" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.45rem", fontSize: "0.92rem" }}>Available drills</h3>
        <div style={{ display: "grid", gap: "0.3rem" }}>
          {packages.map((entry) => {
            const drillCount = entry.workingPackage.drills.length;
            const phaseCount = getSortedPhases(entry.workingPackage).length;
            const drill = getPrimaryDrill(entry.workingPackage);
            const bundledAssets = entry.workingPackage.assets.filter((asset) => asset.uri.startsWith("package://"));
            const phaseImages = bundledAssets.filter((asset) => asset.role === "phase-source-image").length;
            const thumbnails = bundledAssets.filter((asset) => asset.role === "drill-thumbnail").length;

            return (
              <button
                key={entry.packageKey}
                type="button"
                onClick={() => selectPackage(entry.packageKey)}
                className="studio-library-item-button"
                style={{
                  textAlign: "left",
                  border: selectedPackageKey === entry.packageKey ? "1px solid var(--accent)" : "1px solid var(--border)",
                  borderRadius: "0.6rem",
                  background: selectedPackageKey === entry.packageKey ? "var(--accent-soft)" : "var(--panel-soft)",
                  color: "var(--text)",
                  padding: "0.45rem",
                  cursor: "pointer"
                }}
              >
                <strong className="studio-library-item-title" style={{ display: "block" }}>
                  {drill?.title ?? entry.workingPackage.manifest.packageId}
                </strong>
                <small className="muted studio-library-item-subline">
                  {drillCount} drill(s) • {phaseCount} phase(s) • revision {entry.workingPackage.manifest.packageVersion}
                </small>
                <small className="muted studio-library-item-subline" style={{ display: "block" }}>
                  {entry.workingPackage.manifest.packageId} • {entry.isDirty ? "unsaved" : "saved"}
                </small>
                <small className="muted studio-library-item-subline" style={{ display: "block" }}>
                  {summarizeProvenance(entry.workingPackage)}
                </small>
                <small className="muted studio-library-item-subline" style={{ display: "block" }}>
                  Assets: {bundledAssets.length} total • {phaseImages} phase images • {thumbnails} thumbnails
                </small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card" style={{ padding: "0.6rem" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.35rem", fontSize: "0.92rem" }}>Import feedback</h3>
        {importFeedback.status === "idle" ? (
          <p className="muted" style={{ margin: 0 }}>
            Open a drill file from the top bar. Studio validates it before adding it to your local library.
          </p>
        ) : (
          <>
            <p
              style={{
                marginTop: 0,
                color:
                  importFeedback.status === "error"
                    ? "#fecaca"
                    : importFeedback.status === "warning"
                      ? "#fde68a"
                      : "#bbf7d0"
              }}
            >
              [{importFeedback.status}] {importFeedback.message}
            </p>
            {importFeedback.issues.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: "1rem" }}>
                {importFeedback.issues.slice(0, 5).map((issue, index) => (
                  <li key={`${issue.path}-${index}`} className="muted">
                    [{issue.severity}] {issue.path}: {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
