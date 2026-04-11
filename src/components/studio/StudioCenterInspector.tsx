"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { PoseCanvas } from "@/components/studio/canvas/PoseCanvas";
import { StudioMetadataEditor } from "@/components/studio/StudioMetadataEditor";
import { StudioReviewTabs } from "@/components/studio/StudioReviewTabs";
import { StudioActionBar } from "@/components/studio/StudioActionBar";
import { StudioAnimationPreviewPanel } from "@/components/studio/animation/StudioAnimationPreviewPanel";
import { DetectionWorkflowPanel } from "@/components/studio/detection/DetectionWorkflowPanel";
import { useStudioState } from "@/components/studio/StudioState";
import { getPrimaryDrill, getSortedPhases } from "@/lib/editor/package-editor";
import { mapPortablePoseToCanvasPoseModel } from "@/lib/package/mapping/canvas-view-models";

const WORKFLOW_SECTION_IDS = {
  drillSetup: 0,
  phaseSequence: 1,
  review: 2
} as const;

const DEFAULT_OPEN_SECTIONS: Record<number, boolean> = {
  [WORKFLOW_SECTION_IDS.drillSetup]: true,
  [WORKFLOW_SECTION_IDS.phaseSequence]: true,
  [WORKFLOW_SECTION_IDS.review]: false
};

type WorkspaceMode = "preview" | "pose";

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
          <span className="studio-workflow-chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
          <span>{title}</span>
        </span>
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
    setPhaseSummary,
    selectedPhaseEditorView,
    addPhase,
    deletePhase,
    duplicatePhase,
    movePhase,
    setJointCoordinates,
    selectedPhaseSourceImage,
    selectedPhaseOverlayState,
    setSelectedPhaseOverlayState,
    resetSelectedPhaseOverlayState
  } = useStudioState();

  const [activeStepOverride, setActiveStepOverride] = useState<number | null>(null);
  const [sectionOpenState, setSectionOpenState] = useState<Record<number, boolean>>({});
  const [workspaceVisible, setWorkspaceVisible] = useState(true);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("preview");
  const [workspacePhaseId, setWorkspacePhaseId] = useState<string | null>(null);
  const [showDetectionTools, setShowDetectionTools] = useState(false);
  const [workspaceAlignOffset, setWorkspaceAlignOffset] = useState(0);
  const phaseSequenceSectionRef = useRef<HTMLDivElement | null>(null);
  const phaseRowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const phases = useMemo(() => (selectedPackage ? getSortedPhases(selectedPackage.workingPackage) : []), [selectedPackage]);
  const selectedDrill = useMemo(() => (selectedPackage ? getPrimaryDrill(selectedPackage.workingPackage) : null), [selectedPackage]);
  const holdDrill = selectedDrill?.drillType === "hold";
  const displayedPhases = useMemo(() => (holdDrill ? phases.slice(0, 1) : phases), [holdDrill, phases]);

  const selectedPhase = useMemo(() => phases.find((phase) => phase.phaseId === selectedPhaseId) ?? null, [phases, selectedPhaseId]);
  const workspaceActivePhaseId = workspacePhaseId ?? selectedPhaseId;
  const workspacePhase = useMemo(() => phases.find((phase) => phase.phaseId === workspaceActivePhaseId) ?? null, [phases, workspaceActivePhaseId]);
  const workspacePose = workspacePhase?.poseSequence[0] ?? null;
  const poseModel = useMemo(
    () =>
      mapPortablePoseToCanvasPoseModel(
        workspacePose
          ? {
              ...workspacePose,
              canvas: {
                ...workspacePose.canvas,
                view: selectedPhaseEditorView
              }
            }
          : null
      ),
    [workspacePose, selectedPhaseEditorView]
  );

  const inferredStepIndex = useMemo(() => {
    if (!selectedPackage) return WORKFLOW_SECTION_IDS.drillSetup;
    if (!selectedPhase) return WORKFLOW_SECTION_IDS.phaseSequence;
    return WORKFLOW_SECTION_IDS.review;
  }, [selectedPackage, selectedPhase]);

  const currentStepIndex = activeStepOverride ?? inferredStepIndex;

  function isSectionOpen(stepIndex: number): boolean {
    if (sectionOpenState[stepIndex] !== undefined) return sectionOpenState[stepIndex];
    return DEFAULT_OPEN_SECTIONS[stepIndex] ?? false;
  }

  function handleSectionToggle(isOpen: boolean, stepIndex: number): void {
    setSectionOpenState((current) => ({ ...current, [stepIndex]: isOpen }));
    if (isOpen) setActiveStepOverride(stepIndex);
    else if (activeStepOverride === stepIndex) setActiveStepOverride(null);
  }

  function openPoseWorkspace(phaseId: string): void {
    selectPhase(phaseId);
    setWorkspacePhaseId(phaseId);
    setWorkspaceMode("pose");
    setWorkspaceVisible(true);
    setShowDetectionTools(false);
  }

  useEffect(() => {
    if (workspaceMode !== "pose" || !workspaceVisible || !workspacePhase?.phaseId) {
      setWorkspaceAlignOffset(0);
      return;
    }

    const sequenceEl = phaseSequenceSectionRef.current;
    const rowEl = phaseRowRefs.current[workspacePhase.phaseId];
    if (!sequenceEl || !rowEl) {
      setWorkspaceAlignOffset(0);
      return;
    }

    const sequenceTop = sequenceEl.getBoundingClientRect().top + window.scrollY;
    const rowTop = rowEl.getBoundingClientRect().top + window.scrollY;
    const offset = Math.max(0, Math.min(320, rowTop - sequenceTop));
    setWorkspaceAlignOffset(offset);
  }, [workspaceMode, workspaceVisible, workspacePhase?.phaseId, displayedPhases.length]);

  return (
    <div className="panel-content studio-scrollable-panel" style={{ display: "grid", gap: "0.65rem", alignContent: "start" }}>
      <header>
        <h2 style={{ marginTop: 0, marginBottom: "0.3rem" }}>Drill Studio editor</h2>
        <p className="muted" style={{ margin: 0 }}>Define your drill, organize phases, then review animation.</p>
      </header>

      <StudioActionBar />

      <div className="studio-authoring-workspace-grid">
        <div className="studio-authoring-main-flow">
          <WorkflowSection title="1. Drill setup" stepIndex={WORKFLOW_SECTION_IDS.drillSetup} currentStepIndex={currentStepIndex} open={isSectionOpen(WORKFLOW_SECTION_IDS.drillSetup)} onToggle={handleSectionToggle}>
            <StudioMetadataEditor />
          </WorkflowSection>

          <WorkflowSection title="2. Phase sequence" stepIndex={WORKFLOW_SECTION_IDS.phaseSequence} currentStepIndex={currentStepIndex} open={isSectionOpen(WORKFLOW_SECTION_IDS.phaseSequence)} onToggle={handleSectionToggle}>
            {!selectedPackage ? (
              <p className="muted" style={{ margin: 0 }}>Open a drill to manage phases.</p>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.45rem", flexWrap: "wrap", alignItems: "center" }}>
                  <p className="muted" style={{ margin: 0 }}>
                    {holdDrill ? "Hold drills use one primary phase in this simplified workflow." : `Rep drill with ${displayedPhases.length} phases.`}
                  </p>
                  <button type="button" onClick={() => addPhase()} className="studio-button studio-button-primary" disabled={holdDrill}>Add phase</button>
                </div>

                <div ref={phaseSequenceSectionRef} style={{ display: "grid", gap: "0.45rem", marginTop: "0.55rem" }}>
                  {displayedPhases.map((phase, index) => (
                    <div key={phase.phaseId} ref={(element) => {
                      phaseRowRefs.current[phase.phaseId] = element;
                    }} className="studio-phase-list-item card" data-selected={selectedPhase?.phaseId === phase.phaseId}>
                      <div style={{ display: "grid", gap: "0.45rem" }}>
                        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
                          <span className="studio-phase-sequence-pill">#{index + 1}</span>
                          <input value={phase.name} onChange={(event) => renamePhase(phase.phaseId, event.target.value)} style={{ ...inputStyle, maxWidth: "420px" }} />
                          <button type="button" className="studio-button" onClick={() => selectPhase(phase.phaseId)}>Select</button>
                          {workspaceMode === "pose" && workspaceVisible && workspacePhase?.phaseId === phase.phaseId ? <span className="pill">Editing in workspace</span> : null}
                        </div>

                        <div className="studio-action-row">
                          <button type="button" className="studio-button studio-button-primary" onClick={() => openPoseWorkspace(phase.phaseId)}>Edit pose</button>
                          <button type="button" className="studio-button" onClick={() => openPoseWorkspace(phase.phaseId)}>Upload image</button>
                          <button type="button" className="studio-button" onClick={() => openPoseWorkspace(phase.phaseId)} disabled>Use camera</button>
                          {!holdDrill ? <button type="button" className="studio-button" onClick={() => movePhase(phase.phaseId, "up")} disabled={index === 0}>↑</button> : null}
                          {!holdDrill ? <button type="button" className="studio-button" onClick={() => movePhase(phase.phaseId, "down")} disabled={index === displayedPhases.length - 1}>↓</button> : null}
                          {!holdDrill ? <button type="button" className="studio-button" onClick={() => duplicatePhase(phase.phaseId)}>Duplicate</button> : null}
                          {!holdDrill ? <button type="button" className="studio-button studio-button-danger" onClick={() => deletePhase(phase.phaseId)} disabled={displayedPhases.length <= 1}>Delete</button> : null}
                        </div>

                        <textarea
                          value={phase.summary ?? ""}
                          onChange={(event) => setPhaseSummary(phase.phaseId, event.target.value)}
                          style={{ ...inputStyle, minHeight: "54px", resize: "vertical" }}
                          placeholder="Optional phase notes"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </WorkflowSection>

          <WorkflowSection title="3. Review" stepIndex={WORKFLOW_SECTION_IDS.review} currentStepIndex={currentStepIndex} open={isSectionOpen(WORKFLOW_SECTION_IDS.review)} onToggle={handleSectionToggle}>
            <StudioReviewTabs includePreview={false} />
          </WorkflowSection>
        </div>

        <aside className="studio-sticky-workspace" style={workspaceMode === "pose" && workspaceVisible ? { marginTop: `${workspaceAlignOffset}px` } : undefined}>
          <div className="card" style={{ display: "grid", gap: "0.45rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.45rem" }}>
              <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Workspace</h3>
              <button type="button" className="studio-button" onClick={() => setWorkspaceVisible((current) => !current)}>
                {workspaceVisible ? "Hide" : "Show"}
              </button>
            </div>
            {workspaceVisible ? (
              <div className="studio-action-row">
                <button type="button" className={`studio-button ${workspaceMode === "preview" ? "studio-button-primary" : ""}`} onClick={() => setWorkspaceMode("preview")}>Animation</button>
                <button type="button" className={`studio-button ${workspaceMode === "pose" ? "studio-button-primary" : ""}`} onClick={() => setWorkspaceMode("pose")} disabled={!workspacePhase}>Phase pose</button>
              </div>
            ) : null}
          </div>

          {!workspaceVisible ? (
            <div className="card"><p className="muted" style={{ margin: 0 }}>Workspace hidden.</p></div>
          ) : workspaceMode === "preview" ? (
            <StudioAnimationPreviewPanel compact />
          ) : workspacePhase ? (
            <>
              <section className="card" style={{ display: "grid", gap: "0.55rem" }}>
                <PoseCanvas
                  pose={poseModel}
                  title="Phase pose editor"
                  subtitle={`Phase ${workspacePhase.order}: ${workspacePhase.name}`}
                  selected
                  editable
                  selectedJointName={selectedJointName}
                  onJointSelect={selectJoint}
                  onJointMove={(joint, x, y) => setJointCoordinates(workspacePhase.phaseId, joint, x, y)}
                  showPoseLayer={selectedPhaseOverlayState.showPose}
                  sizeMode="balanced"
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
                <div className="studio-action-row">
                  <button type="button" onClick={() => setSelectedPhaseOverlayState({ showImage: !selectedPhaseOverlayState.showImage })} className="studio-button">
                    {selectedPhaseOverlayState.showImage ? "Hide image" : "Show image"}
                  </button>
                  <button type="button" onClick={() => setSelectedPhaseOverlayState({ showPose: !selectedPhaseOverlayState.showPose })} className="studio-button">
                    {selectedPhaseOverlayState.showPose ? "Hide pose" : "Show pose"}
                  </button>
                  <button type="button" onClick={() => setShowDetectionTools((current) => !current)} className="studio-button">
                    {showDetectionTools ? "Hide upload tools" : "Upload tools"}
                  </button>
                  <button type="button" onClick={() => resetSelectedPhaseOverlayState()} className="studio-button">Reset</button>
                  <button type="button" onClick={() => setWorkspaceMode("preview")} className="studio-button studio-button-primary">Done</button>
                </div>
                {showDetectionTools ? <DetectionWorkflowPanel phaseId={workspacePhase.phaseId} /> : null}
              </section>
            </>
          ) : (
            <div className="card"><p className="muted" style={{ margin: 0 }}>Select a phase and click Edit pose to open the workspace.</p></div>
          )}
        </aside>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  background: "var(--panel-soft)",
  color: "var(--text)",
  padding: "0.45rem"
};
