"use client";

import type { CSSProperties } from "react";
import { getPrimaryDrill } from "@/lib/editor/package-editor";
import { useStudioState } from "@/components/studio/StudioState";

export function StudioMetadataEditor() {
  const {
    selectedPackage,
    setDrillTitle,
    setDrillDifficulty,
    setDrillDefaultView,
    setManifestSchemaVersion,
    setManifestPackageId,
    setManifestPackageVersion
  } = useStudioState();

  if (!selectedPackage) {
    return (
      <section>
        <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Drill metadata</h3>
        <p className="muted" style={{ margin: 0 }}>
          Load or import a drill file to edit metadata.
        </p>
      </section>
    );
  }

  const drill = getPrimaryDrill(selectedPackage.workingPackage);
  if (!drill) {
    return null;
  }

  return (
    <section>
      <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Drill metadata</h3>
      <div style={{ display: "grid", gap: "0.55rem" }}>
        <label style={labelStyle}>
          <span>Title</span>
          <input value={drill.title} onChange={(event) => setDrillTitle(event.target.value)} style={inputStyle} />
        </label>

        <label style={labelStyle}>
          <span>Difficulty</span>
          <select value={drill.difficulty} onChange={(event) => setDrillDifficulty(event.target.value as typeof drill.difficulty)} style={inputStyle}>
            <option value="beginner">beginner</option>
            <option value="intermediate">intermediate</option>
            <option value="advanced">advanced</option>
          </select>
        </label>

        <label style={labelStyle}>
          <span>Primary view</span>
          <select value={drill.defaultView} onChange={(event) => setDrillDefaultView(event.target.value as typeof drill.defaultView)} style={inputStyle}>
            <option value="front">front</option>
            <option value="side">side</option>
            <option value="rear">rear</option>
          </select>
        </label>

        <label style={labelStyle}>
          <span>Schema version</span>
          <select
            value={selectedPackage.workingPackage.manifest.schemaVersion}
            onChange={(event) => setManifestSchemaVersion(event.target.value as typeof selectedPackage.workingPackage.manifest.schemaVersion)}
            style={inputStyle}
          >
            <option value="0.1.0">0.1.0</option>
          </select>
        </label>

        <label style={labelStyle}>
          <span>Package ID</span>
          <input
            value={selectedPackage.workingPackage.manifest.packageId}
            onChange={(event) => setManifestPackageId(event.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          <span>Package version</span>
          <input
            value={selectedPackage.workingPackage.manifest.packageVersion}
            onChange={(event) => setManifestPackageVersion(event.target.value)}
            style={inputStyle}
          />
        </label>
      </div>
    </section>
  );
}

const labelStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
  color: "var(--muted)",
  fontSize: "0.85rem"
};

const inputStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  background: "var(--panel-soft)",
  color: "var(--text)",
  padding: "0.45rem"
};
