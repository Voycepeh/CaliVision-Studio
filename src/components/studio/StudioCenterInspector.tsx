"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { PoseCanvas } from "@/components/studio/canvas/PoseCanvas";
import { StudioMetadataEditor } from "@/components/studio/StudioMetadataEditor";
import { StudioReviewTabs } from "@/components/studio/StudioReviewTabs";
import { StudioActionBar } from "@/components/studio/StudioActionBar";
import { StudioRightPanel } from "@/components/studio/StudioRightPanel";
import { DetectionWorkflowPanel } from "@/components/studio/detection/DetectionWorkflowPanel";
import { useStudioState } from "@/components/studio/StudioState";
import { getSortedPhases } from "@/lib/editor/package-editor";
import { formatDurationShort } from "@/lib/format/duration";
import { mapPortablePoseToCanvasPoseModel } from "@/lib/package/mapping/canvas-view-models";
import { STANDARD_AUTHORING_JOINTS } from "@/lib/pose/canonical";
import type { CanonicalJointName, PortableViewType } from "@/lib/schema/contracts";

const NUDGE_STEP = 0.01;

const WORKFLOW_SECTION_IDS = {
  drillInfo: 0,
  phases: 1,
  sourceImage: 2,
  poseAuthoring: 3,
  review: 4
} as const;

const DEFAULT_OPEN_SECTIONS: Record<number, boolean> = {
  [WORKFLOW_SECTION_IDS.drillInfo]: true,
  [WORKFLOW_SECTION_IDS.phases]: true,
  [WORKFLOW_SECTION_IDS.sourceImage]: false,
  [WORKFLOW_SECTION_IDS.poseAuthoring]: false,
  [WORKFLOW_SECTION_IDS.review]: false
};

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

function WorkflowSection({
  title,
  stepIndex,
  currentStepIndex,
  open,
  onToggle,
  children
}: {
  title: string;
  stepIndex: number;
  currentStepIndex: number;
  open: boolean;
  onToggle: (isOpen: boolean, stepIndex: number) => void;
  children: ReactNode;
}) {
  return (
    <details className="card studio-workflow-section" data-current={stepIndex === currentStepIndex} open={open} onToggle={(event) => onToggle((event.currentTarget as HTMLDetailsElement).open, stepIndex)}>
      <summary className="studio-workflow-section-summary">
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          <span className="studio-workflow-chevron" aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
          <span>{title}</span>
        </span>
        {stepIndex === currentStepIndex ? <strong className="pill">Current step</strong> : null}
      </summary>
      <div className="studio-workflow-section-body">{children}</div>
    </details>
  );
}

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
    selectedPhaseEditorView,
    setPhaseEditorView,
    addPhase,
    deletePhase,
    duplicatePhase,
    movePhase,
    setJointCoordinates,
    nudgeJoint,
    revertSelectedJoint,
    selectedPhaseSourceImage,
    selectedPhaseOverlayState,
    setSelectedPhaseOverlayState,
    resetSelectedPhaseOverlayState
  } = useStudioState();

  const [focusRegion, setFocusRegion] = useState<FocusRegion>("full");
  const [isPoseCanvasExpanded, setIsPoseCanvasExpanded] = useState(false);
  const [activeStepOverride, setActiveStepOverride] = useState<number | null>(null);
  const [sectionOpenState, setSectionOpenState] = useState<Record<number, boolean>>({});

  const phases = useMemo(() => (selectedPackage ? getSortedPhases(selectedPackage.workingPackage) : []), [selectedPackage]);
  const selectedPhase = useMemo(() => phases.find((phase) => phase.phaseId === selectedPhaseId) ?? null, [phases, selectedPhaseId]);
  const selectedPose = selectedPhase?.poseSequence[0] ?? null;
  const poseModel = useMemo(
    () =>
      mapPortablePoseToCanvasPoseModel(
        selectedPose
          ? {
              ...selectedPose,
              canvas: {
                ...selectedPose.canvas,
                view: selectedPhaseEditorView
              }
            }
          : null
      ),
    [selectedPose, selectedPhaseEditorView]
  );
  const focusJointSet = useMemo(() => new Set(REGION_JOINTS[focusRegion]), [focusRegion]);
  const selectedJoint = selectedJointName ? selectedPose?.joints[selectedJointName] : null;

  const inferredStepIndex = useMemo(() => {
    if (!selectedPackage) return WORKFLOW_SECTION_IDS.drillInfo;
    if (!selectedPhase) return WORKFLOW_SECTION_IDS.phases;
    if (!selectedPhaseSourceImage) return WORKFLOW_SECTION_IDS.sourceImage;
    if (!selectedPose) return WORKFLOW_SECTION_IDS.poseAuthoring;
    return WORKFLOW_SECTION_IDS.review;
  }, [selectedPackage, selectedPhase, selectedPhaseSourceImage, selectedPose]);

  const currentStepIndex = activeStepOverride ?? inferredStepIndex;

  function isSectionOpen(stepIndex: number): boolean {
    if (sectionOpenState[stepIndex] !== undefined) {
      return sectionOpenState[stepIndex];
    }

    return DEFAULT_OPEN_SECTIONS[stepIndex] ?? false;
  }

  function handleSectionToggle(isOpen: boolean, stepIndex: number): void {
    setSectionOpenState((current) => ({
      ...current,
      [stepIndex]: isOpen
    }));

    if (isOpen) {
      setActiveStepOverride(stepIndex);
    } else if (activeStepOverride === stepIndex) {
      setActiveStepOverride(null);
    }
  }

  return (
    <div className="panel-content studio-scrollable-panel" style={{ display: "grid", gap: "0.65rem", alignContent: "start" }}>
      <header>
        <h2 style={{ marginTop: 0, marginBottom: "0.3rem" }}>Drill Studio editor workflow</h2>
        <p className="muted" style={{ margin: 0 }}>
          Work top-to-bottom: drill info, phases, source image, pose refinement, and review.
        </p>
      </header>

      <StudioActionBar />

      <div className="studio-authoring-workspace-grid">
        <div style={{ display: "grid", gap: "0.65rem", alignContent: "start" }}>
          <WorkflowSection title="Drill info" stepIndex={WORKFLOW_SECTION_IDS.drillInfo} currentStepIndex={currentStepIndex} open={isSectionOpen(WORKFLOW_SECTION_IDS.drillInfo)} onToggle={handleSectionToggle}>
            <StudioMetadataEditor />
          </WorkflowSection>

          <WorkflowSection title="Phases" stepIndex={WORKFLOW_SECTION_IDS.phases} currentStepIndex={currentStepIndex} open={isSectionOpen(WORKFLOW_SECTION_IDS.phases)} onToggle={handleSectionToggle}>
            {!selectedPackage ? (
              <p className="muted" style={{ margin: 0 }}>Open a drill to manage phases.</p>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                  <p className="muted" style={{ margin: 0 }}>Select a phase, then reorder, duplicate, or delete as needed.</p>
                  <div className="studio-action-row">
                    <button type="button" onClick={() => addPhase()} className="studio-button studio-button-primary">Add phase</button>
                    <button type="button" onClick={() => selectPhase(null)} className="studio-button">Clear selection</button>
                  </div>
                </div>
                <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.65rem" }}>
                  {phases.map((phase, index) => (
                    <div key={phase.phaseId} className="studio-phase-list-item" data-selected={selectedPhase?.phaseId === phase.phaseId}>
                      <button type="button" onClick={() => selectPhase(phase.phaseId)} style={phaseButtonStyle} className="studio-phase-select-button">
                        <div className="studio-phase-list-heading">
                          <strong className="studio-phase-list-title">{phase.order}. {phase.title}</strong>
                          <span className="muted studio-phase-list-meta">{formatDurationShort(phase.durationMs)} • {phase.assetRefs.length > 0 ? "image attached" : "no image"}</span>
                        </div>
                        <small className="muted studio-phase-list-subline">{phase.phaseId} • {phase.poseSequence[0] ? "pose ready" : "pose missing"}</small>
                      </button>

                      <div className="studio-action-row">
                        <button type="button" onClick={() => movePhase(phase.phaseId, "up")} className="studio-button" disabled={index === 0}>Move up</button>
                        <button type="button" onClick={() => movePhase(phase.phaseId, "down")} className="studio-button" disabled={index === phases.length - 1}>Move down</button>
                        <button type="button" onClick={() => duplicatePhase(phase.phaseId)} className="studio-button">Duplicate</button>
                        <button type="button" onClick={() => deletePhase(phase.phaseId)} className="studio-button studio-button-danger" disabled={phases.length <= 1}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedPhase ? (
                  <div className="card studio-selected-phase-basics">
                    <h4 style={{ margin: 0, fontSize: "0.92rem" }}>Selected phase</h4>
                    <p className="muted" style={{ margin: 0 }}>Saved to the drill file: phase name, duration, and author notes.</p>
                    <div className="field-grid">
                      <label style={labelStyle}>
                        <span>Phase name</span>
                        <input value={selectedPhase.title} onChange={(event) => renamePhase(selectedPhase.phaseId, event.target.value)} style={inputStyle} />
                      </label>

                      <label style={labelStyle}>
                        <span>Duration (seconds)</span>
                        <input
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={Number((selectedPhase.durationMs / 1000).toFixed(1))}
                          onChange={(event) => {
                            const secondsValue = Number(event.target.value);
                            if (!Number.isFinite(secondsValue)) {
                              return;
                            }
                            setPhaseDuration(selectedPhase.phaseId, Math.max(1, Math.round(secondsValue * 1000)));
                          }}
                          style={inputStyle}
                        />
                      </label>
                    </div>

                    <label style={labelStyle}>
                      <span>Summary / notes</span>
                      <textarea value={selectedPhase.summary ?? ""} onChange={(event) => setPhaseSummary(selectedPhase.phaseId, event.target.value)} style={{ ...inputStyle, minHeight: "74px", resize: "vertical" }} />
                    </label>
                  </div>
                ) : null}
              </>
            )}
          </WorkflowSection>

          <WorkflowSection title="Phase source image" stepIndex={WORKFLOW_SECTION_IDS.sourceImage} currentStepIndex={currentStepIndex} open={isSectionOpen(WORKFLOW_SECTION_IDS.sourceImage)} onToggle={handleSectionToggle}>
            {selectedPhase ? <DetectionWorkflowPanel phaseId={selectedPhase.phaseId} /> : <p className="muted" style={{ margin: 0 }}>Select a phase to upload an image and run detection.</p>}
          </WorkflowSection>
        </div>

        <div style={{ display: "grid", gap: "0.65rem", alignContent: "start" }}>
          <WorkflowSection title="Pose authoring" stepIndex={WORKFLOW_SECTION_IDS.poseAuthoring} currentStepIndex={currentStepIndex} open={isSectionOpen(WORKFLOW_SECTION_IDS.poseAuthoring)} onToggle={handleSectionToggle}>
            {selectedPhase ? (
              <>
                <section className="card studio-inspector-controls-row" style={{ marginBottom: "0.65rem" }}>
                  <p className="muted" style={{ margin: 0, gridColumn: "1 / -1" }}>
                    Editor-only controls (not saved to the drill file).
                  </p>
                  <label style={labelStyle}>
                    <span>Selected joint</span>
                    <select value={selectedJointName ?? ""} style={inputStyle} onChange={(event) => selectJoint((event.target.value || null) as CanonicalJointName | null)}>
                      <option value="">None</option>
                      {STANDARD_AUTHORING_JOINTS.map((joint) => <option key={joint.name} value={joint.name}>{joint.label}</option>)}
                    </select>
                  </label>

                  <label style={labelStyle}>
                    <span>Focus region</span>
                    <select value={focusRegion} style={inputStyle} onChange={(event) => setFocusRegion(event.target.value as FocusRegion)}>
                      {FOCUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>

                  <label style={labelStyle}>
                    <span>Editor view</span>
                    <select value={selectedPhaseEditorView} style={inputStyle} onChange={(event) => setPhaseEditorView(selectedPhase.phaseId, event.target.value as PortableViewType)}>
                      <option value="front">front</option>
                      <option value="side">side</option>
                      <option value="rear">rear</option>
                    </select>
                  </label>

                  <label style={labelStyle}>
                    <span>Canvas size</span>
                    <button type="button" onClick={() => setIsPoseCanvasExpanded((current) => !current)} className="studio-button" aria-pressed={isPoseCanvasExpanded}>
                      {isPoseCanvasExpanded ? "Use standard canvas" : "Focus canvas"}
                    </button>
                  </label>
                </section>

                <PoseCanvas
                  pose={poseModel}
                  title="Phase pose editor"
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

                <section className="card studio-selected-joint-controls">
                  <h4 style={{ margin: 0, fontSize: "0.92rem" }}>Selected joint</h4>
                  {selectedJointName ? (
                    <>
                      <div className="field-grid">
                        <label style={labelStyle}>
                          <span>X (normalized 0-1)</span>
                          <input type="number" min={0} max={1} step={0.01} value={selectedJoint?.x ?? 0.5} onChange={(event) => setJointCoordinates(selectedPhase.phaseId, selectedJointName, Number(event.target.value), selectedJoint?.y ?? 0.5)} style={inputStyle} />
                        </label>
                        <label style={labelStyle}>
                          <span>Y (normalized 0-1)</span>
                          <input type="number" min={0} max={1} step={0.01} value={selectedJoint?.y ?? 0.5} onChange={(event) => setJointCoordinates(selectedPhase.phaseId, selectedJointName, selectedJoint?.x ?? 0.5, Number(event.target.value))} style={inputStyle} />
                        </label>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "0.35rem" }}>
                        <button type="button" className="studio-button" onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, 0, -NUDGE_STEP)}>↑</button>
                        <button type="button" className="studio-button" onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, -NUDGE_STEP, 0)}>←</button>
                        <button type="button" className="studio-button" onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, NUDGE_STEP, 0)}>→</button>
                        <button type="button" className="studio-button" onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, 0, NUDGE_STEP)}>↓</button>
                        <button type="button" className="studio-button" onClick={() => revertSelectedJoint(selectedPhase.phaseId, selectedJointName)}>Revert joint</button>
                      </div>
                    </>
                  ) : <p className="muted" style={{ margin: 0 }}>Select a joint from the canvas or dropdown to nudge and refine it.</p>}
                </section>

                <section className="card studio-overlay-controls">
                  <h4 style={{ margin: 0, fontSize: "0.92rem" }}>Overlay alignment</h4>
                  <div className="studio-action-row">
                    <button type="button" onClick={() => setSelectedPhaseOverlayState({ showImage: !selectedPhaseOverlayState.showImage })} className="studio-button">
                      {selectedPhaseOverlayState.showImage ? "Hide image" : "Show image"}
                    </button>
                    <button type="button" onClick={() => setSelectedPhaseOverlayState({ showPose: !selectedPhaseOverlayState.showPose })} className="studio-button">
                      {selectedPhaseOverlayState.showPose ? "Hide pose" : "Show pose"}
                    </button>
                    <button type="button" onClick={() => resetSelectedPhaseOverlayState()} className="studio-button">Reset overlay</button>
                  </div>
                </section>
              </>
            ) : <p className="muted" style={{ margin: 0 }}>Select a phase to begin pose authoring.</p>}
          </WorkflowSection>

          <WorkflowSection title="Review" stepIndex={WORKFLOW_SECTION_IDS.review} currentStepIndex={currentStepIndex} open={isSectionOpen(WORKFLOW_SECTION_IDS.review)} onToggle={handleSectionToggle}>
            <StudioReviewTabs />
          </WorkflowSection>
          <StudioRightPanel />
        </div>
      </div>
    </div>
  );
}

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
