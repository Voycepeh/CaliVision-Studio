"use client";

import type { CSSProperties } from "react";
import { getPrimaryDrill } from "@/lib/editor/package-editor";
import { useStudioState } from "@/components/studio/StudioState";

export function StudioMetadataEditor() {
  const {
    selectedPackage,
    setDrillTitle,
    setDrillDescription,
    setDrillType,
    setDrillDifficulty,
    setDrillDefaultView
  } = useStudioState();

  if (!selectedPackage) {
    return (
      <section>
        <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Drill info</h3>
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
  const draftSetup = (drill as typeof drill & { draftSetup?: { movementTypeConfigured?: boolean; cameraViewConfigured?: boolean } }).draftSetup;
  const movementValue = draftSetup?.movementTypeConfigured ? drill.drillType : "";
  const cameraValue = draftSetup?.cameraViewConfigured ? drill.primaryView : "";

  return (
    <section style={{ display: "grid", gap: "0.55rem" }}>
      <div className="field-grid">
        <label style={labelStyle}>
          <span>Drill title</span>
          <input value={drill.title} onChange={(event) => setDrillTitle(event.target.value)} style={inputStyle} placeholder="Add drill title" />
        </label>
      </div>

      <label style={labelStyle}>
        <span>Movement type</span>
        <select
          value={movementValue}
          onChange={(event) => {
            if (!event.target.value) return;
            setDrillType(event.target.value as typeof drill.drillType);
          }}
          style={inputStyle}
        >
          <option value="">Choose movement type</option>
          <option value="hold">hold</option>
          <option value="rep">rep</option>
        </select>
      </label>

      <label style={labelStyle}>
        <span>Description</span>
        <textarea
          value={drill.description ?? ""}
          onChange={(event) => setDrillDescription(event.target.value)}
          style={{ ...inputStyle, minHeight: "74px", resize: "vertical" }}
        />
      </label>

      <div className="field-grid">
        <label style={labelStyle}>
          <span>Difficulty</span>
          <select value={drill.difficulty} onChange={(event) => setDrillDifficulty(event.target.value as typeof drill.difficulty)} style={inputStyle}>
            <option value="beginner">beginner</option>
            <option value="intermediate">intermediate</option>
            <option value="advanced">advanced</option>
          </select>
        </label>

        <label style={labelStyle}>
          <span>Camera view</span>
          <select
            value={cameraValue}
            onChange={(event) => {
              if (!event.target.value) return;
              setDrillDefaultView(event.target.value as typeof drill.primaryView);
            }}
            style={inputStyle}
          >
            <option value="">Choose camera view</option>
            <option value="front">front</option>
            <option value="side">side</option>
            <option value="rear">rear</option>
          </select>
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
