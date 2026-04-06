"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { StudioInspectorAccordion } from "@/components/studio/StudioInspectorAccordion";
import { StudioMetadataEditor } from "@/components/studio/StudioMetadataEditor";
import { StudioPhaseDetailsPanel } from "@/components/studio/StudioPhaseDetailsPanel";
import { useStudioState } from "@/components/studio/StudioState";
import { getSortedPhases } from "@/lib/editor/package-editor";

const NUDGE_STEP = 0.01;

export function StudioRightPanel() {
  const {
    selectedPackage,
    selectedPhaseId,
    selectedJointName,
    selectedPhaseSourceImage,
    selectedPhaseOverlayState,
    setSelectedPhaseOverlayState,
    resetSelectedPhaseOverlayState,
    setJointCoordinates,
    nudgeJoint,
    revertSelectedJoint
  } = useStudioState();

  const selectedPhase = useMemo(() => {
    if (!selectedPackage) {
      return null;
    }

    return getSortedPhases(selectedPackage.workingPackage).find((phase) => phase.phaseId === selectedPhaseId) ?? null;
  }, [selectedPackage, selectedPhaseId]);

  const selectedPose = selectedPhase?.poseSequence[0] ?? null;
  const selectedJoint = selectedJointName ? selectedPose?.joints[selectedJointName] : null;

  return (
    <div className="panel-content studio-scrollable-panel" style={{ display: "grid", gap: "0.7rem", alignContent: "start" }}>
      <h2 style={{ marginTop: 0, marginBottom: "0.25rem" }}>Inspector</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Collapsible drill details and advanced editing controls.
      </p>

      <StudioInspectorAccordion title="Drill metadata" defaultOpen>
        <StudioMetadataEditor />
      </StudioInspectorAccordion>

      <StudioInspectorAccordion title="Phase details" defaultOpen>
        <StudioPhaseDetailsPanel />
      </StudioInspectorAccordion>

      <StudioInspectorAccordion title="Joint editor" defaultOpen>
        {selectedPhase ? (
          selectedJointName ? (
            <div style={{ display: "grid", gap: "0.45rem" }}>
              <label style={labelStyle}>
                <span>X (normalized 0-1)</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={selectedJoint?.x ?? 0.5}
                  onChange={(event) =>
                    setJointCoordinates(selectedPhase.phaseId, selectedJointName, Number(event.target.value), selectedJoint?.y ?? 0.5)
                  }
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                <span>Y (normalized 0-1)</span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={selectedJoint?.y ?? 0.5}
                  onChange={(event) =>
                    setJointCoordinates(selectedPhase.phaseId, selectedJointName, selectedJoint?.x ?? 0.5, Number(event.target.value))
                  }
                  style={inputStyle}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "0.25rem" }}>
                <button type="button" style={smallButtonStyle} onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, 0, -NUDGE_STEP)}>
                  ↑
                </button>
                <button type="button" style={smallButtonStyle} onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, -NUDGE_STEP, 0)}>
                  ←
                </button>
                <button type="button" style={smallButtonStyle} onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, NUDGE_STEP, 0)}>
                  →
                </button>
                <button type="button" style={smallButtonStyle} onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, 0, NUDGE_STEP)}>
                  ↓
                </button>
                <button type="button" style={smallButtonStyle} onClick={() => revertSelectedJoint(selectedPhase.phaseId, selectedJointName)}>
                  Revert joint
                </button>
              </div>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Select a joint from canvas or dropdown to edit coordinates.
            </p>
          )
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Select a phase to edit canonical joints.
          </p>
        )}
      </StudioInspectorAccordion>

      <StudioInspectorAccordion title="Advanced overlay controls">
        {selectedPhase ? (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setSelectedPhaseOverlayState({ showImage: !selectedPhaseOverlayState.showImage })}
                style={smallButtonStyle}
              >
                {selectedPhaseOverlayState.showImage ? "Hide image" : "Show image"}
              </button>
              <button type="button" onClick={() => setSelectedPhaseOverlayState({ showPose: !selectedPhaseOverlayState.showPose })} style={smallButtonStyle}>
                {selectedPhaseOverlayState.showPose ? "Hide pose" : "Show pose"}
              </button>
              <button type="button" onClick={() => resetSelectedPhaseOverlayState()} style={smallButtonStyle}>
                Reset overlay
              </button>
            </div>

            <label style={labelStyle}>
              <span>Image opacity ({Math.round(selectedPhaseOverlayState.imageOpacity * 100)}%)</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(selectedPhaseOverlayState.imageOpacity * 100)}
                onChange={(event) => setSelectedPhaseOverlayState({ imageOpacity: Number(event.target.value) / 100 })}
                disabled={!selectedPhaseSourceImage}
              />
            </label>

            <label style={labelStyle}>
              <span>Image fit</span>
              <select
                value={selectedPhaseOverlayState.fitMode}
                style={inputStyle}
                onChange={(event) => setSelectedPhaseOverlayState({ fitMode: event.target.value as "contain" | "cover" })}
                disabled={!selectedPhaseSourceImage}
              >
                <option value="contain">contain</option>
                <option value="cover">cover</option>
              </select>
            </label>

            <div className="field-grid">
              <label style={labelStyle}>
                <span>Image X offset ({selectedPhaseOverlayState.offsetX.toFixed(2)})</span>
                <input
                  type="range"
                  min={-0.5}
                  max={0.5}
                  step={0.01}
                  value={selectedPhaseOverlayState.offsetX}
                  onChange={(event) => setSelectedPhaseOverlayState({ offsetX: Number(event.target.value) })}
                  disabled={!selectedPhaseSourceImage}
                />
              </label>
              <label style={labelStyle}>
                <span>Image Y offset ({selectedPhaseOverlayState.offsetY.toFixed(2)})</span>
                <input
                  type="range"
                  min={-0.5}
                  max={0.5}
                  step={0.01}
                  value={selectedPhaseOverlayState.offsetY}
                  onChange={(event) => setSelectedPhaseOverlayState({ offsetY: Number(event.target.value) })}
                  disabled={!selectedPhaseSourceImage}
                />
              </label>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Image transforms are editor-only alignment aids. Canonical normalized pose coordinates remain unchanged and exportable.
            </p>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Select a phase to tune overlay controls.
          </p>
        )}
      </StudioInspectorAccordion>

      <StudioInspectorAccordion title="Review handoff">
        {selectedPackage ? (
          <p className="muted" style={{ margin: 0 }}>
            Use center Review tabs for animation preview, full validation results, warnings, and source-image detection/apply flow.
          </p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Load a drill file to access review tabs and validation.
          </p>
        )}
      </StudioInspectorAccordion>
    </div>
  );
}

const smallButtonStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  background: "var(--panel-soft)",
  color: "var(--text)",
  padding: "0.35rem 0.6rem",
  cursor: "pointer"
};

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
