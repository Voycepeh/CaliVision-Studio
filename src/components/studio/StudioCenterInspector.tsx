"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { PoseCanvas } from "@/components/studio/canvas/PoseCanvas";
import { StudioMetadataEditor } from "@/components/studio/StudioMetadataEditor";
import { StudioReviewTabs } from "@/components/studio/StudioReviewTabs";
import { StudioActionBar } from "@/components/studio/StudioActionBar";
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

type ExpandIntent = "pose" | "upload" | "camera";

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
  const [expandedPhaseId, setExpandedPhaseId] = useState<string | null>(null);
  const [expandIntent, setExpandIntent] = useState<ExpandIntent>("pose");

  const phases = useMemo(() => (selectedPackage ? getSortedPhases(selectedPackage.workingPackage) : []), [selectedPackage]);
  const selectedDrill = useMemo(() => (selectedPackage ? getPrimaryDrill(selectedPackage.workingPackage) : null), [selectedPackage]);
  const holdDrill = selectedDrill?.drillType === "hold";
  const displayedPhases = useMemo(() => (holdDrill ? phases.slice(0, 1) : phases), [holdDrill, phases]);

  const selectedPhase = useMemo(() => phases.find((phase) => phase.phaseId === selectedPhaseId) ?? null, [phases, selectedPhaseId]);

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

  function openInlineEditor(phaseId: string, intent: ExpandIntent): void {
    selectPhase(phaseId);
    setExpandedPhaseId(phaseId);
    setExpandIntent(intent);
  }

  function closeInlineEditor(): void {
    setExpandedPhaseId(null);
    setExpandIntent("pose");
  }

  return (
    <div className="panel-content studio-scrollable-panel" style={{ display: "grid", gap: "0.65rem", alignContent: "start" }}>
      <header>
        <h2 style={{ marginTop: 0, marginBottom: "0.3rem" }}>Drill Studio editor</h2>
        <p className="muted" style={{ margin: 0 }}>Define your drill, organize phases, then review animation.</p>
      </header>

      <StudioActionBar />

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

            <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.55rem" }}>
              {displayedPhases.map((phase, index) => {
                const isExpanded = expandedPhaseId === phase.phaseId;
                const phasePose = phase.poseSequence[0] ?? null;
                const poseModel = mapPortablePoseToCanvasPoseModel(
                  phasePose
                    ? {
                        ...phasePose,
                        canvas: {
                          ...phasePose.canvas,
                          view: selectedPhaseEditorView
                        }
                      }
                    : null
                );

                return (
                  <div key={phase.phaseId} className="studio-phase-list-item card" data-selected={selectedPhase?.phaseId === phase.phaseId}>
                    <div className="studio-phase-item-grid">
                      <div className="studio-phase-row-head">
                        <span className="studio-phase-sequence-pill">#{index + 1}</span>
                        <input value={phase.name} onChange={(event) => renamePhase(phase.phaseId, event.target.value)} style={{ ...inputStyle, width: "min(100%, 420px)" }} />
                        {isExpanded ? <span className="pill">Editor open</span> : null}
                      </div>

                      <div className="studio-action-row studio-phase-actions">
                        <button type="button" className="studio-button studio-button-primary" onClick={() => openInlineEditor(phase.phaseId, "pose")}>Edit pose</button>
                        <button type="button" className="studio-button" onClick={() => openInlineEditor(phase.phaseId, "upload")}>Upload image</button>
                        <button type="button" className="studio-button" onClick={() => openInlineEditor(phase.phaseId, "camera")}>Use camera</button>
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

                      {isExpanded ? (
                        <section className="card" style={{ display: "grid", gap: "0.55rem" }}>
                          <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Phase editor</h3>
                          <PoseCanvas
                            pose={poseModel}
                            title="Phase pose editor"
                            subtitle={`Phase ${phase.order}: ${phase.name}`}
                            selected
                            editable
                            selectedJointName={selectedJointName}
                            onJointSelect={selectJoint}
                            onJointMove={(joint, x, y) => setJointCoordinates(phase.phaseId, joint, x, y)}
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

                          <div className="studio-action-row studio-phase-actions">
                            <button type="button" onClick={() => setSelectedPhaseOverlayState({ showImage: !selectedPhaseOverlayState.showImage })} className="studio-button">
                              {selectedPhaseOverlayState.showImage ? "Hide image" : "Show image"}
                            </button>
                            <button type="button" onClick={() => setSelectedPhaseOverlayState({ showPose: !selectedPhaseOverlayState.showPose })} className="studio-button">
                              {selectedPhaseOverlayState.showPose ? "Hide pose" : "Show pose"}
                            </button>
                            <button type="button" onClick={() => resetSelectedPhaseOverlayState()} className="studio-button">Reset overlays</button>
                            <button type="button" onClick={() => closeInlineEditor()} className="studio-button studio-button-primary">Done</button>
                          </div>

                          <DetectionWorkflowPanel phaseId={phase.phaseId} autoOpenSource={expandIntent === "pose" ? null : expandIntent} />
                        </section>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </WorkflowSection>

      <WorkflowSection title="3. Review" stepIndex={WORKFLOW_SECTION_IDS.review} currentStepIndex={currentStepIndex} open={isSectionOpen(WORKFLOW_SECTION_IDS.review)} onToggle={handleSectionToggle}>
        <StudioReviewTabs />
      </WorkflowSection>
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
