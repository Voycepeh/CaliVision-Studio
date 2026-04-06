"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { PoseCanvas } from "@/components/studio/canvas/PoseCanvas";
import { useStudioState } from "@/components/studio/StudioState";
import { getSortedPhases } from "@/lib/editor/package-editor";
import { mapPortablePoseToCanvasPoseModel } from "@/lib/package/mapping/canvas-view-models";
import { STANDARD_AUTHORING_JOINTS } from "@/lib/pose/canonical";
import type { CanonicalJointName, PortableViewType } from "@/lib/schema/contracts";

const NUDGE_STEP = 0.01;

type FocusRegion = "full" | "upper" | "lower" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg";

const FOCUS_OPTIONS: Array<{ value: FocusRegion; label: string }> = [
  { value: "full", label: "Full body" },
  { value: "upper", label: "Upper body" },
  { value: "lower", label: "Lower body" },
  { value: "leftArm", label: "Left arm" },
  { value: "rightArm", label: "Right arm" },
  { value: "leftLeg", label: "Left leg" },
  { value: "rightLeg", label: "Right leg" }
];

const REGION_JOINTS: Record<FocusRegion, CanonicalJointName[]> = {
  full: STANDARD_AUTHORING_JOINTS.map((joint) => joint.name),
  upper: ["nose", "leftEye", "rightEye", "leftEar", "rightEar", "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftWrist", "rightWrist"],
  lower: ["leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle"],
  leftArm: ["leftShoulder", "leftElbow", "leftWrist"],
  rightArm: ["rightShoulder", "rightElbow", "rightWrist"],
  leftLeg: ["leftHip", "leftKnee", "leftAnkle"],
  rightLeg: ["rightHip", "rightKnee", "rightAnkle"]
};

export function StudioCenterInspector() {
  const {
    selectedPackage,
    selectedPhaseId,
    selectedJointName,
    selectPhase,
    selectJoint,
    renamePhase,
    setPhaseDuration,
    setPhaseSummary,
    setPhaseView,
    addPhase,
    deletePhase,
    duplicatePhase,
    movePhase,
    setJointCoordinates,
    nudgeJoint,
    revertSelectedJoint,
    selectedPhaseSourceImage,
    selectedPhaseDetection,
    selectedPhaseOverlayState,
    setSelectedPhaseOverlayState,
    resetSelectedPhaseOverlayState
  } = useStudioState();

  const [focusRegion, setFocusRegion] = useState<FocusRegion>("full");

  const phases = useMemo(() => (selectedPackage ? getSortedPhases(selectedPackage.workingPackage) : []), [selectedPackage]);
  const selectedPhase = useMemo(() => phases.find((phase) => phase.phaseId === selectedPhaseId) ?? null, [phases, selectedPhaseId]);
  const selectedPose = selectedPhase?.poseSequence[0] ?? null;
  const poseModel = mapPortablePoseToCanvasPoseModel(selectedPose);
  const selectedJoint = selectedJointName ? selectedPose?.joints[selectedJointName] : null;
  const hasPoseJoints = poseModel.joints.length > 0;

  const focusJointSet = useMemo(() => new Set(REGION_JOINTS[focusRegion]), [focusRegion]);

  return (
    <div className="panel-content studio-scrollable-panel" style={{ display: "grid", gap: "0.75rem", alignContent: "start" }}>
      <header>
        <h2 style={{ marginTop: 0, marginBottom: "0.3rem" }}>Drill Workspace</h2>
        <p className="muted" style={{ margin: 0 }}>
          Center authoring workspace for phase editing, canonical pose adjustments, and joint controls.
        </p>
      </header>

      {!selectedPackage ? (
        <section className="card">
          <p className="muted" style={{ margin: 0 }}>
            No drill file loaded. Load a sample or import a local JSON drill file.
          </p>
        </section>
      ) : (
        <>
          <section className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0 }}>Phase list</h3>
              <div style={{ display: "flex", gap: "0.35rem" }}>
                <button type="button" onClick={() => addPhase()} style={smallButtonStyle}>
                  Add phase
                </button>
                <button type="button" onClick={() => selectPhase(null)} style={smallButtonStyle}>
                  Clear
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gap: "0.35rem", marginTop: "0.5rem" }}>
              {phases.map((phase, index) => (
                <div key={phase.phaseId} className="studio-phase-list-item" data-selected={selectedPhase?.phaseId === phase.phaseId}>
                  <button type="button" onClick={() => selectPhase(phase.phaseId)} style={phaseButtonStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                      <strong>
                        {phase.order}. {phase.title}
                      </strong>
                      <span className="muted">{(phase.durationMs / 1000).toFixed(1)}s • {phase.assetRefs.length > 0 ? "image attached" : "no image"}</span>
                    </div>
                    <small className="muted">
                      {phase.phaseId} • {phase.poseSequence[0] ? "pose ready" : "pose missing"}
                    </small>
                  </button>

                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                    <button type="button" onClick={() => movePhase(phase.phaseId, "up")} style={smallButtonStyle} disabled={index === 0}>
                      Move up
                    </button>
                    <button type="button" onClick={() => movePhase(phase.phaseId, "down")} style={smallButtonStyle} disabled={index === phases.length - 1}>
                      Move down
                    </button>
                    <button type="button" onClick={() => duplicatePhase(phase.phaseId)} style={smallButtonStyle}>
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePhase(phase.phaseId)}
                      style={{ ...smallButtonStyle, borderColor: "rgba(232,131,131,0.45)", color: "#f2bbbb" }}
                      disabled={phases.length <= 1}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {selectedPhase ? (
            <>
              <section className="card studio-inspector-controls-row">
                <label style={labelStyle}>
                  <span>Selected joint</span>
                  <select
                    value={selectedJointName ?? ""}
                    style={inputStyle}
                    onChange={(event) => selectJoint((event.target.value || null) as CanonicalJointName | null)}
                  >
                    <option value="">None</option>
                    {STANDARD_AUTHORING_JOINTS.map((joint) => (
                      <option key={joint.name} value={joint.name}>
                        {joint.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={labelStyle}>
                  <span>Focus region</span>
                  <select value={focusRegion} style={inputStyle} onChange={(event) => setFocusRegion(event.target.value as FocusRegion)}>
                    {FOCUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={labelStyle}>
                  <span>Phase view</span>
                  <select
                    value={selectedPose?.canvas.view ?? "front"}
                    style={inputStyle}
                    onChange={(event) => setPhaseView(selectedPhase.phaseId, event.target.value as PortableViewType)}
                  >
                    <option value="front">front</option>
                    <option value="side">side</option>
                    <option value="rear">rear</option>
                  </select>
                </label>
              </section>

              <PoseCanvas
                pose={poseModel}
                title="Canonical phase pose editor"
                subtitle={`Phase ${selectedPhase.order}: ${selectedPhase.title}`}
                selected
                editable
                selectedJointName={selectedJointName}
                onJointSelect={selectJoint}
                onJointMove={(joint, x, y) => setJointCoordinates(selectedPhase.phaseId, joint, x, y)}
                focusJointNames={focusJointSet}
                showPoseLayer={selectedPhaseOverlayState.showPose}
                imageLayer={
                  selectedPhaseSourceImage && selectedPhaseOverlayState.showImage
                    ? {
                        src: selectedPhaseSourceImage.objectUrl,
                        naturalWidth: selectedPhaseSourceImage.width,
                        naturalHeight: selectedPhaseSourceImage.height,
                        opacity: selectedPhaseOverlayState.imageOpacity,
                        fitMode: selectedPhaseOverlayState.fitMode,
                        offsetX: selectedPhaseOverlayState.offsetX,
                        offsetY: selectedPhaseOverlayState.offsetY
                      }
                    : null
                }
              />

              <section className="card">
                <h3 style={{ marginTop: 0, marginBottom: "0.45rem", fontSize: "0.95rem" }}>Overlay controls</h3>
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedPhaseOverlayState({ showImage: !selectedPhaseOverlayState.showImage })}
                      style={smallButtonStyle}
                    >
                      {selectedPhaseOverlayState.showImage ? "Hide image" : "Show image"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPhaseOverlayState({ showPose: !selectedPhaseOverlayState.showPose })}
                      style={smallButtonStyle}
                    >
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
              </section>

              <section className="card">
                <h3 style={{ marginTop: 0, marginBottom: "0.45rem", fontSize: "0.95rem" }}>Authoring workflow status</h3>
                <ol className="muted" style={{ margin: 0, paddingLeft: "1rem", display: "grid", gap: "0.2rem" }}>
                  <li>Selected phase: {selectedPhase.title}</li>
                  <li>Source image: {selectedPhaseSourceImage ? selectedPhaseSourceImage.fileName : "missing"}</li>
                  <li>Detection state: {selectedPhaseDetection.status}</li>
                  <li>Canonical pose: {hasPoseJoints ? `${poseModel.joints.length} joints visible` : "not populated"}</li>
                  <li>Manual adjustments: {selectedJointName ? `editing ${selectedJointName}` : "ready"}</li>
                </ol>
              </section>

              <section className="card">
                <h3 style={{ marginTop: 0, marginBottom: "0.45rem", fontSize: "0.95rem" }}>Joint editor</h3>
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
                )}
              </section>

              <section className="card">
                <h3 style={{ marginTop: 0, marginBottom: "0.45rem", fontSize: "0.95rem" }}>Selected phase editor</h3>
                <div style={{ display: "grid", gap: "0.55rem" }}>
                  <label style={labelStyle}>
                    <span>Phase name</span>
                    <input value={selectedPhase.title} onChange={(event) => renamePhase(selectedPhase.phaseId, event.target.value)} style={inputStyle} />
                  </label>

                  <label style={labelStyle}>
                    <span>Duration (ms)</span>
                    <input
                      type="number"
                      min={1}
                      step={100}
                      value={selectedPhase.durationMs}
                      onChange={(event) => setPhaseDuration(selectedPhase.phaseId, Number(event.target.value))}
                      style={inputStyle}
                    />
                  </label>

                  <label style={labelStyle}>
                    <span>Summary / notes</span>
                    <textarea
                      value={selectedPhase.summary ?? ""}
                      onChange={(event) => setPhaseSummary(selectedPhase.phaseId, event.target.value)}
                      style={{ ...inputStyle, minHeight: "74px", resize: "vertical" }}
                    />
                  </label>
                </div>
              </section>
            </>
          ) : (
            <section className="card">
              <p className="muted" style={{ margin: 0 }}>
                Select a phase to start editing the canonical pose and controls.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const smallButtonStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "999px",
  background: "var(--panel-soft)",
  color: "var(--text)",
  padding: "0.25rem 0.6rem",
  cursor: "pointer"
};

const phaseButtonStyle: CSSProperties = {
  textAlign: "left",
  border: "none",
  background: "transparent",
  color: "var(--text)",
  padding: 0,
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
