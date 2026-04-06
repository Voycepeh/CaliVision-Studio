"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { PoseCanvas } from "@/components/studio/canvas/PoseCanvas";
import { StudioReviewTabs } from "@/components/studio/StudioReviewTabs";
import { useStudioState } from "@/components/studio/StudioState";
import { getSortedPhases } from "@/lib/editor/package-editor";
import { mapPortablePoseToCanvasPoseModel } from "@/lib/package/mapping/canvas-view-models";
import { STANDARD_AUTHORING_JOINTS } from "@/lib/pose/canonical";
import type { CanonicalJointName, PortableViewType } from "@/lib/schema/contracts";

const WORKFLOW_STEPS = ["Select phase", "Align pose", "Attach source image", "Review animation", "Export"];

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
    selectedPhaseSourceImage,
    selectedPhaseOverlayState
  } = useStudioState();

  const [focusRegion, setFocusRegion] = useState<FocusRegion>("full");
  const [isPoseCanvasExpanded, setIsPoseCanvasExpanded] = useState(false);

  const phases = useMemo(() => (selectedPackage ? getSortedPhases(selectedPackage.workingPackage) : []), [selectedPackage]);
  const selectedPhase = useMemo(() => phases.find((phase) => phase.phaseId === selectedPhaseId) ?? null, [phases, selectedPhaseId]);
  const selectedPose = selectedPhase?.poseSequence[0] ?? null;
  const poseModel = mapPortablePoseToCanvasPoseModel(selectedPose);
  const focusJointSet = useMemo(() => new Set(REGION_JOINTS[focusRegion]), [focusRegion]);

  return (
    <div className="panel-content studio-scrollable-panel" style={{ display: "grid", gap: "0.65rem", alignContent: "start" }}>
      <header>
        <h2 style={{ marginTop: 0, marginBottom: "0.3rem" }}>Edit workspace</h2>
        <p className="muted" style={{ margin: 0 }}>
          One-page drill authoring organized around source, edit, and review.
        </p>
      </header>

      <section className="card studio-workflow-cue" aria-label="Authoring workflow">
        {WORKFLOW_STEPS.map((step, index) => (
          <span key={step} className={selectedPhase ? "" : index > 0 ? "muted" : ""}>
            {index + 1}. {step}
          </span>
        ))}
      </section>

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
                    <div className="studio-phase-list-heading">
                      <strong className="studio-phase-list-title">
                        {phase.order}. {phase.title}
                      </strong>
                      <span className="muted studio-phase-list-meta">
                        {(phase.durationMs / 1000).toFixed(1)}s • {phase.assetRefs.length > 0 ? "image attached" : "no image"}
                      </span>
                    </div>
                    <small className="muted studio-phase-list-subline">
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

                <label style={labelStyle}>
                  <span>Canvas size</span>
                  <button
                    type="button"
                    onClick={() => setIsPoseCanvasExpanded((current) => !current)}
                    style={smallButtonStyle}
                    aria-pressed={isPoseCanvasExpanded}
                  >
                    {isPoseCanvasExpanded ? "Use balanced canvas" : "Expand canvas"}
                  </button>
                </label>
              </section>

              <section className="card" style={{ display: "grid", gap: "0.55rem" }}>
                <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Selected phase basics</h3>
                <div className="field-grid">
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
                </div>

                <label style={labelStyle}>
                  <span>Summary / notes</span>
                  <textarea
                    value={selectedPhase.summary ?? ""}
                    onChange={(event) => setPhaseSummary(selectedPhase.phaseId, event.target.value)}
                    style={{ ...inputStyle, minHeight: "74px", resize: "vertical" }}
                  />
                </label>
              </section>

              <PoseCanvas
                pose={poseModel}
                title="Canonical pose editor"
                subtitle={`Phase ${selectedPhase.order}: ${selectedPhase.title}`}
                selected
                editable
                selectedJointName={selectedJointName}
                onJointSelect={selectJoint}
                onJointMove={(joint, x, y) => setJointCoordinates(selectedPhase.phaseId, joint, x, y)}
                focusJointNames={focusJointSet}
                showPoseLayer={selectedPhaseOverlayState.showPose}
                sizeMode={isPoseCanvasExpanded ? "focus" : "balanced"}
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

              <StudioReviewTabs />
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
