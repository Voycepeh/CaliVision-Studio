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
  review: 2,
  versionActions: 3
} as const;

const DEFAULT_OPEN_SECTIONS: Record<number, boolean> = {
  [WORKFLOW_SECTION_IDS.drillSetup]: true,
  [WORKFLOW_SECTION_IDS.phaseSequence]: true,
  [WORKFLOW_SECTION_IDS.review]: false,
  [WORKFLOW_SECTION_IDS.versionActions]: true
};

type ExpandIntent = "pose" | "upload";

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
    selectedPhaseDetection,
    selectPhase,
    selectJoint,
    renamePhase,
    setPhaseSummary,
    setPhaseComparisonRule,
    selectedPhaseEditorView,
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

  const phaseCards = displayedPhases.map((phase, index) => {
    const isExpanded = expandedPhaseId === phase.phaseId;
    const holdRuleEnabled = phase.analysis?.comparison?.isHoldPhase ?? false;
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

          <div className="card" style={{ display: "grid", gap: "0.45rem", padding: "0.6rem" }}>
            <strong style={{ fontSize: "0.82rem" }}>Phase rules</strong>
            <p className="muted" style={{ margin: 0, fontSize: "0.78rem", lineHeight: 1.35 }}>
              This phase participates in sequence checks by default. Enable hold rules only when this phase needs timing validation.
            </p>
            <div style={phaseRuleToggleRowStyle}>
              <label style={phaseRuleToggleLabelStyle}>
                <input
                  type="checkbox"
                  checked={holdRuleEnabled}
                  onChange={(event) => setPhaseComparisonRule(phase.phaseId, {
                    isHoldPhase: event.target.checked,
                    durationMatters: event.target.checked || phase.analysis?.comparison?.durationMatters
                  })}
                />
                <span>Hold requirement</span>
              </label>
              <span className="muted" style={phaseRuleToggleHintStyle}>
                {holdRuleEnabled ? "Enabled" : "Optional"}
              </span>
            </div>
            {holdRuleEnabled ? (
              <div style={{ display: "grid", gap: "0.35rem", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                <label style={phaseRuleFieldLabelStyle}>
                  Min hold (ms)
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={phase.analysis?.comparison?.minHoldDurationMs ?? ""}
                    onChange={(event) => setPhaseComparisonRule(phase.phaseId, {
                      minHoldDurationMs: event.target.value === "" ? undefined : Number(event.target.value),
                      durationMatters: event.target.value !== ""
                    })}
                    style={inputStyle}
                    placeholder="Required only for hold phases"
                  />
                </label>
                <label style={phaseRuleFieldLabelStyle}>
                  Target hold (ms)
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={phase.analysis?.comparison?.targetHoldDurationMs ?? ""}
                    onChange={(event) => setPhaseComparisonRule(phase.phaseId, {
                      targetHoldDurationMs: event.target.value === "" ? undefined : Number(event.target.value),
                      durationMatters: event.target.value !== ""
                    })}
                    style={inputStyle}
                    placeholder="Optional coaching target"
                  />
                </label>
              </div>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: "0.76rem", lineHeight: 1.3 }}>
                No hold timing required for this phase.
              </p>
            )}
          </div>

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

              <div className="studio-action-row studio-phase-actions">
                <button type="button" onClick={() => setSelectedPhaseOverlayState({ fitMode: selectedPhaseOverlayState.fitMode === "contain" ? "cover" : "contain" })} className="studio-button">
                  Focus zoom: {selectedPhaseOverlayState.fitMode === "cover" ? "On" : "Off"}
                </button>
                <button type="button" onClick={() => setSelectedPhaseOverlayState({ offsetX: Math.max(-0.6, selectedPhaseOverlayState.offsetX - 0.08) })} className="studio-button">← Focus</button>
                <button type="button" onClick={() => setSelectedPhaseOverlayState({ offsetX: Math.min(0.6, selectedPhaseOverlayState.offsetX + 0.08) })} className="studio-button">Focus →</button>
                <button type="button" onClick={() => setSelectedPhaseOverlayState({ offsetY: Math.max(-0.6, selectedPhaseOverlayState.offsetY - 0.08) })} className="studio-button">↑ Focus</button>
                <button type="button" onClick={() => setSelectedPhaseOverlayState({ offsetY: Math.min(0.6, selectedPhaseOverlayState.offsetY + 0.08) })} className="studio-button">↓ Focus</button>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: "0.76rem" }}>
                Saved preview focus uses a 16:9 landscape frame so Exchange, Upload Video, and Live Streaming stay visually consistent.
              </p>
              {selectedPhaseSourceImage ? (
                <div style={{ display: "grid", gap: "0.3rem", maxWidth: 360 }}>
                  <strong style={{ fontSize: "0.82rem" }}>Landscape focus preview (16:9)</strong>
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      aspectRatio: "16 / 9",
                      borderRadius: "0.55rem",
                      overflow: "hidden",
                      border: "1px solid rgba(148, 163, 184, 0.32)",
                      background: "rgba(15, 23, 42, 0.9)"
                    }}
                  >
                    <img
                      src={selectedPhaseSourceImage.objectUrl}
                      alt="Landscape focus preview"
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: selectedPhaseOverlayState.fitMode,
                        objectPosition: `${50 + selectedPhaseOverlayState.offsetX * 38}% ${50 + selectedPhaseOverlayState.offsetY * 38}%`,
                        opacity: selectedPhaseOverlayState.showImage ? Math.max(0.2, selectedPhaseOverlayState.imageOpacity) : 0.26
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        border: "1px dashed rgba(191, 219, 254, 0.5)",
                        pointerEvents: "none"
                      }}
                    />
                  </div>
                  <p className="muted" style={{ margin: 0, fontSize: "0.74rem" }}>
                    This is the frame that will be used for saved landscape motion previews.
                  </p>
                </div>
              ) : null}

              {selectedJointName ? (
                <div className="studio-joint-nudge-panel">
                  <p className="muted" style={{ margin: 0 }}>Nudge {selectedJointName}</p>
                  <div className="studio-joint-dpad">
                    <span />
                    <button type="button" className="studio-button" onClick={() => nudgeJoint(phase.phaseId, selectedJointName, 0, -0.01)}>↑</button>
                    <span />
                    <button type="button" className="studio-button" onClick={() => nudgeJoint(phase.phaseId, selectedJointName, -0.01, 0)}>←</button>
                    <button type="button" className="studio-button studio-button-primary" onClick={() => revertSelectedJoint(phase.phaseId, selectedJointName)}>Reset joint</button>
                    <button type="button" className="studio-button" onClick={() => nudgeJoint(phase.phaseId, selectedJointName, 0.01, 0)}>→</button>
                    <span />
                    <button type="button" className="studio-button" onClick={() => nudgeJoint(phase.phaseId, selectedJointName, 0, 0.01)}>↓</button>
                    <span />
                  </div>
                </div>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Select a joint on the canvas to nudge it.</p>
              )}

              {selectedPhaseDetection.status === "failed" ? (
                <p className="muted" style={{ margin: 0 }}>{selectedPhaseDetection.message}</p>
              ) : null}

              <DetectionWorkflowPanel phaseId={phase.phaseId} autoOpenSource={expandIntent === "upload" ? "upload" : null} />
            </section>
          ) : null}
        </div>
      </div>
    );
  });

  return (
    <div className="panel-content studio-scrollable-panel" style={{ display: "grid", gap: "0.65rem", alignContent: "start" }}>
      <header>
        <h2 style={{ marginTop: 0, marginBottom: "0.3rem" }}>Drill Studio editor</h2>
        <p className="muted" style={{ margin: 0 }}>Define your drill, organize phases, then review animation.</p>
      </header>

      <WorkflowSection title="1. Drill setup" stepIndex={WORKFLOW_SECTION_IDS.drillSetup} currentStepIndex={currentStepIndex} open={isSectionOpen(WORKFLOW_SECTION_IDS.drillSetup)} onToggle={handleSectionToggle}>
        <div style={{ display: "grid", gap: "0.55rem" }}>
          <StudioMetadataEditor />
        </div>
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
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem", lineHeight: 1.4 }}>
              Drill phases are the reference standard. Configure phase rules only where hold/timing checks are needed.
            </p>

            {displayedPhases.length === 0 ? (
              <div className="card" style={{ marginTop: "0.55rem", display: "grid", gap: "0.45rem" }}>
                <strong>Add your first phase</strong>
                <p className="muted" style={{ margin: 0 }}>
                  This draft starts empty. Add a phase, then author its pose from upload or manual editing.
                </p>
                <button type="button" onClick={() => addPhase()} className="studio-button studio-button-primary" style={{ width: "fit-content" }}>
                  Add first phase
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.55rem" }}>{phaseCards}</div>
            )}
          </>
        )}
      </WorkflowSection>

      <WorkflowSection title="3. Review" stepIndex={WORKFLOW_SECTION_IDS.review} currentStepIndex={currentStepIndex} open={isSectionOpen(WORKFLOW_SECTION_IDS.review)} onToggle={handleSectionToggle}>
        <StudioReviewTabs />
      </WorkflowSection>

      <WorkflowSection title="4. Drill version actions" stepIndex={WORKFLOW_SECTION_IDS.versionActions} currentStepIndex={currentStepIndex} open={isSectionOpen(WORKFLOW_SECTION_IDS.versionActions)} onToggle={handleSectionToggle}>
        <StudioActionBar />
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

const phaseRuleToggleLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.45rem",
  fontSize: "0.78rem",
  lineHeight: 1.25
};

const phaseRuleToggleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  flexWrap: "wrap"
};

const phaseRuleToggleHintStyle: CSSProperties = {
  fontSize: "0.76rem",
  lineHeight: 1.25
};

const phaseRuleFieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: "0.2rem",
  fontSize: "0.78rem",
  lineHeight: 1.25
};
