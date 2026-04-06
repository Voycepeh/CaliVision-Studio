"use client";

import { getSortedPhases, getPrimaryDrill } from "@/lib/editor/package-editor";
import { SAMPLE_PACKAGE_DEFINITIONS } from "@/lib/package";
import { useStudioState } from "@/components/studio/StudioState";

export function LibraryPanel() {
  const { packages, selectedPackageKey, selectPackage, loadSampleById, importFeedback } = useStudioState();

  return (
    <div className="panel-content">
      <h2 style={{ marginTop: 0 }}>Library & Sources</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Browse bundled drills, imported drill files, and validation feedback.
      </p>

      <section className="card" style={{ marginBottom: "0.8rem" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "0.95rem" }}>Sample drills</h3>
        <div style={{ display: "grid", gap: "0.45rem" }}>
          {SAMPLE_PACKAGE_DEFINITIONS.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => loadSampleById(sample.id)}
              className="studio-library-item-button"
              style={{
                textAlign: "left",
                border: "1px solid var(--border)",
                borderRadius: "0.65rem",
                background: "var(--panel-soft)",
                color: "var(--text)",
                padding: "0.5rem",
                cursor: "pointer"
              }}
            >
              <strong className="studio-library-item-title" style={{ display: "block", marginBottom: "0.2rem" }}>
                {sample.label}
              </strong>
              <small className="muted studio-library-item-subline">{sample.description}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginBottom: "0.8rem" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "0.95rem" }}>Loaded drills</h3>
        <div style={{ display: "grid", gap: "0.35rem" }}>
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
                  borderRadius: "0.65rem",
                  background: selectedPackageKey === entry.packageKey ? "var(--accent-soft)" : "var(--panel-soft)",
                  color: "var(--text)",
                  padding: "0.5rem",
                  cursor: "pointer"
                }}
              >
                <strong className="studio-library-item-title" style={{ display: "block" }}>
                  {entry.workingPackage.manifest.packageId}
                </strong>
                <small className="muted studio-library-item-subline">
                  v{entry.workingPackage.manifest.packageVersion} • {drillCount} drill(s) • {phaseCount} phase(s)
                </small>
                <small className="muted studio-library-item-subline" style={{ display: "block" }}>
                  {drill?.title ?? "No drill"} • {entry.isDirty ? "unsaved" : "saved"}
                </small>
                <small className="muted studio-library-item-subline" style={{ display: "block" }}>
                  Bundled assets: {bundledAssets.length} total • {phaseImages} phase images • {thumbnails} thumbnails
                </small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Drill file import feedback</h3>
        {importFeedback.status === "idle" ? (
          <p className="muted" style={{ margin: 0 }}>
            Import a JSON drill package or bundled .cvpkg.json file from the top bar to validate and load it.
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
