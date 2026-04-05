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
        Browse bundled packages, imported JSON payloads, and validation feedback.
      </p>

      <section className="card" style={{ marginBottom: "0.8rem" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "0.95rem" }}>Sample packages</h3>
        <div style={{ display: "grid", gap: "0.45rem" }}>
          {SAMPLE_PACKAGE_DEFINITIONS.map((sample) => (
            <button
              key={sample.id}
              type="button"
              onClick={() => loadSampleById(sample.id)}
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
              <strong style={{ display: "block", marginBottom: "0.2rem" }}>{sample.label}</strong>
              <small className="muted">{sample.description}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginBottom: "0.8rem" }}>
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "0.95rem" }}>Loaded packages</h3>
        <div style={{ display: "grid", gap: "0.35rem" }}>
          {packages.map((entry) => {
            const drillCount = entry.workingPackage.drills.length;
            const phaseCount = getSortedPhases(entry.workingPackage).length;
            const drill = getPrimaryDrill(entry.workingPackage);

            return (
              <button
                key={entry.packageKey}
                type="button"
                onClick={() => selectPackage(entry.packageKey)}
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
                <strong style={{ display: "block" }}>{entry.workingPackage.manifest.packageId}</strong>
                <small className="muted">
                  v{entry.workingPackage.manifest.packageVersion} • {drillCount} drill(s) • {phaseCount} phase(s)
                </small>
                <small className="muted" style={{ display: "block" }}>
                  {drill?.title ?? "No drill"} • {entry.isDirty ? "unsaved" : "saved"}
                </small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Import feedback</h3>
        {importFeedback.status === "idle" ? (
          <p className="muted" style={{ margin: 0 }}>
            Import a local JSON package from the top bar to validate and load it.
          </p>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>{importFeedback.message}</p>
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
