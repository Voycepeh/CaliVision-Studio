"use client";

import type { CSSProperties } from "react";
import type { PortableViewType } from "@/lib/schema/contracts";
import { useStudioState } from "@/components/studio/StudioState";

export function StudioMetadataEditor() {
  const { selectedPackage, updateDrillMetadata, updatePackageMetadata } = useStudioState();

  if (!selectedPackage) {
    return (
      <section className="card">
        <h3 style={{ marginTop: 0, marginBottom: "0.45rem" }}>Package metadata</h3>
        <p className="muted" style={{ margin: 0 }}>Load a drill package to edit metadata.</p>
      </section>
    );
  }

  const drill = selectedPackage.workingPackage.drills[0];
  const manifest = selectedPackage.workingPackage.manifest;

  return (
    <section className="card" style={{ display: "grid", gap: "0.55rem" }}>
      <h3 style={{ marginTop: 0, marginBottom: 0 }}>Metadata</h3>
      <p className="muted" style={{ margin: 0 }}>Edit movement and package metadata. Changes persist in the current working copy and export output.</p>

      <div style={{ display: "grid", gap: "0.45rem" }}>
        <h4 style={{ margin: 0, fontSize: "0.9rem" }}>Movement details</h4>
        <label style={labelStyle}>
          <span>Title</span>
          <input value={drill?.title ?? ""} style={inputStyle} onChange={(event) => updateDrillMetadata("title", event.target.value)} />
        </label>
        <label style={labelStyle}>
          <span>Difficulty</span>
          <select
            value={drill?.difficulty ?? "beginner"}
            style={inputStyle}
            onChange={(event) => updateDrillMetadata("difficulty", event.target.value)}
          >
            <option value="beginner">beginner</option>
            <option value="intermediate">intermediate</option>
            <option value="advanced">advanced</option>
          </select>
        </label>
        <label style={labelStyle}>
          <span>Primary view</span>
          <select value={drill?.defaultView ?? "front"} style={inputStyle} onChange={(event) => updateDrillMetadata("defaultView", event.target.value as PortableViewType)}>
            <option value="front">front</option>
            <option value="side">side</option>
            <option value="rear">rear</option>
            <option value="three-quarter">three-quarter</option>
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gap: "0.45rem" }}>
        <h4 style={{ margin: 0, fontSize: "0.9rem" }}>Package details</h4>
        <label style={labelStyle}>
          <span>Schema version</span>
          <input value={manifest.schemaVersion} style={inputStyle} onChange={(event) => updatePackageMetadata("schemaVersion", event.target.value)} />
        </label>
        <label style={labelStyle}>
          <span>Package ID</span>
          <input value={manifest.packageId} style={inputStyle} onChange={(event) => updatePackageMetadata("packageId", event.target.value)} />
        </label>
        <label style={labelStyle}>
          <span>Package version</span>
          <input value={manifest.packageVersion} style={inputStyle} onChange={(event) => updatePackageMetadata("packageVersion", event.target.value)} />
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
