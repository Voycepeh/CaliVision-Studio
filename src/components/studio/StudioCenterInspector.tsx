"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { PoseCanvas } from "@/components/studio/canvas/PoseCanvas";
import { getSortedPhases } from "@/lib/editor/package-editor";
import { mapPortablePhaseToInspectorViewModel, mapPortablePoseToCanvasPoseModel } from "@/lib/package/mapping/canvas-view-models";
import { CANONICAL_JOINTS } from "@/lib/pose/canonical";
import type { CanonicalJointName, PortableViewType } from "@/lib/schema/contracts";
import { useStudioState } from "@/components/studio/StudioState";

const NUDGE_STEP = 0.01;

type FocusRegion = "full" | "upper" | "lower" | "left-arm" | "right-arm" | "left-leg" | "right-leg";

const FOCUS_REGION_MAP: Record<FocusRegion, CanonicalJointName[]> = {
  full: CANONICAL_JOINTS.map((joint) => joint.name),
  upper: ["nose", "leftEye", "rightEye", "leftEar", "rightEar", "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftWrist", "rightWrist"],
  lower: ["leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle"],
  "left-arm": ["leftShoulder", "leftElbow", "leftWrist"],
  "right-arm": ["rightShoulder", "rightElbow", "rightWrist"],
  "left-leg": ["leftHip", "leftKnee", "leftAnkle"],
  "right-leg": ["rightHip", "rightKnee", "rightAnkle"]
};

export function StudioCenterInspector() {
  const {
    selectedPackage,
    selectedPhaseId,
    selectedJointName,
    selectJoint,
    setJointCoordinates,
    nudgeJoint,
    revertSelectedJoint,
    setPhaseView
  } = useStudioState();
  const [focusRegion, setFocusRegion] = useState<FocusRegion>("full");

  const selectedPhase = useMemo(() => {
    if (!selectedPackage) {
      return null;
    }

    return getSortedPhases(selectedPackage.workingPackage).find((phase) => phase.phaseId === selectedPhaseId) ?? null;
  }, [selectedPackage, selectedPhaseId]);

  const selectedPhaseSummary = selectedPhase ? mapPortablePhaseToInspectorViewModel(selectedPhase) : null;
  const selectedPose = selectedPhase?.poseSequence[0] ?? null;
  const poseModel = mapPortablePoseToCanvasPoseModel(selectedPose);
  const selectedJoint = selectedJointName ? selectedPose?.joints[selectedJointName] : null;
  const visibleJoints = useMemo(() => {
    const allowed = new Set(FOCUS_REGION_MAP[focusRegion]);
    return CANONICAL_JOINTS.filter((joint) => allowed.has(joint.name));
  }, [focusRegion]);

  return (
    <div className="panel-content" style={{ display: "grid", gap: "0.7rem", alignContent: "start", height: "100%" }}>
      <header>
        <h2 style={{ marginTop: 0, marginBottom: "0.4rem" }}>Inspector & Pose Editor</h2>
        <p className="muted" style={{ margin: 0 }}>
          Focused phase editing workspace. Focus region only filters controls and does not modify saved canonical joint data.
        </p>
      </header>

      {!selectedPackage || !selectedPhase ? (
        <section className="card">
          <p className="muted" style={{ margin: 0 }}>
            Select a drill package and phase to open the canonical pose editor.
          </p>
        </section>
      ) : (
        <>
          <section className="card" style={{ display: "grid", gap: "0.55rem" }}>
            <div className="field-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label style={labelStyle}>
                <span>Selected joint</span>
                <select
                  value={selectedJointName ?? ""}
                  style={inputStyle}
                  onChange={(event) => selectJoint((event.target.value || null) as CanonicalJointName | null)}
                >
                  <option value="">None</option>
                  {visibleJoints.map((joint) => (
                    <option key={joint.name} value={joint.name}>
                      {joint.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={labelStyle}>
                <span>Focus region</span>
                <select value={focusRegion} style={inputStyle} onChange={(event) => setFocusRegion(event.target.value as FocusRegion)}>
                  <option value="full">Full body</option>
                  <option value="upper">Upper body</option>
                  <option value="lower">Lower body</option>
                  <option value="left-arm">Left arm</option>
                  <option value="right-arm">Right arm</option>
                  <option value="left-leg">Left leg</option>
                  <option value="right-leg">Right leg</option>
                </select>
              </label>
            </div>

            <label style={labelStyle}>
              <span>Phase view</span>
              <select value={selectedPose?.canvas.view ?? "front"} style={inputStyle} onChange={(event) => setPhaseView(selectedPhase.phaseId, event.target.value as PortableViewType)}>
                <option value="front">front</option>
                <option value="side">side</option>
                <option value="rear">rear</option>
                <option value="three-quarter">three-quarter</option>
              </select>
            </label>
          </section>

          <div className="studio-pose-canvas-wrap">
            <PoseCanvas
              pose={poseModel}
              title="Canonical phase pose editor"
              subtitle={`Phase ${selectedPhaseSummary?.order}: ${selectedPhaseSummary?.title}`}
              selected
              editable
              selectedJointName={selectedJointName}
              onJointSelect={selectJoint}
              onJointMove={(joint, x, y) => setJointCoordinates(selectedPhase.phaseId, joint, x, y)}
            />
          </div>

          <section className="card">
            <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Joint editor</h3>
            {selectedJointName ? (
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: "0.25rem" }}>
                  <button type="button" style={smallButton} onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, 0, -NUDGE_STEP)}>↑</button>
                  <button type="button" style={smallButton} onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, -NUDGE_STEP, 0)}>←</button>
                  <button type="button" style={smallButton} onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, NUDGE_STEP, 0)}>→</button>
                  <button type="button" style={smallButton} onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, 0, NUDGE_STEP)}>↓</button>
                  <button type="button" style={smallButton} onClick={() => revertSelectedJoint(selectedPhase.phaseId, selectedJointName)}>Revert</button>
                </div>
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>Select a joint from the canvas or control row to edit.</p>
            )}
          </section>
        </>
      )}
    </div>
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

const smallButton: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  background: "var(--panel-soft)",
  color: "var(--text)",
  padding: "0.3rem",
  cursor: "pointer"
};
