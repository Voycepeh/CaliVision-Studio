"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { PoseCanvas } from "@/components/studio/canvas/PoseCanvas";
import { getSortedPhases } from "@/lib/editor/package-editor";
import { mapPortablePhaseToInspectorViewModel, mapPortablePoseToCanvasPoseModel } from "@/lib/package/mapping/canvas-view-models";
import { CANONICAL_JOINTS } from "@/lib/pose/canonical";
import type { CanonicalJointName, PortableViewType } from "@/lib/schema/contracts";
import { useStudioState } from "@/components/studio/StudioState";
import { DetectionWorkflowPanel } from "@/components/studio/detection/DetectionWorkflowPanel";

const NUDGE_STEP = 0.01;

export function InspectorPanel() {
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

  return (
    <div className="panel-content">
      <h2 style={{ marginTop: 0 }}>Inspector & Preview</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Editable canonical pose canvas with deterministic joint selection and normalized coordinate controls.
      </p>

      {!selectedPackage ? (
        <section className="card">
          <p className="muted" style={{ margin: 0 }}>
            No selected package.
          </p>
        </section>
      ) : (
        <div style={{ display: "grid", gap: "0.7rem" }}>
          <section className="card" style={{ minHeight: "92px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Package manifest summary</h3>
            <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
              <li>Schema: {selectedPackage.workingPackage.manifest.schemaVersion}</li>
              <li>Source: {selectedPackage.workingPackage.manifest.source}</li>
              <li>Android min: {selectedPackage.workingPackage.manifest.compatibility.androidMinVersion}</li>
              <li>Android contract: {selectedPackage.workingPackage.manifest.compatibility.androidTargetContract}</li>
              <li>Dirty state: {selectedPackage.isDirty ? "unsaved changes" : "clean"}</li>
            </ul>
          </section>

          {selectedPhase ? (
            <>
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

              <section className="card" style={{ minHeight: "92px" }}>
                <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Selected phase detail</h3>
                <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
                  <li>Phase ID: {selectedPhaseSummary?.phaseId}</li>
                  <li>Order: {selectedPhaseSummary?.order}</li>
                  <li>Duration: {selectedPhaseSummary?.durationMs}ms</li>
                  <li>Pose frames: {selectedPhaseSummary?.poseCount}</li>
                  <li>Assets: {selectedPhaseSummary?.assetCount}</li>
                </ul>
                <label style={{ ...labelStyle, marginTop: "0.5rem" }}>
                  <span>View type</span>
                  <select
                    value={selectedPose?.canvas.view ?? "front"}
                    style={inputStyle}
                    onChange={(event) => setPhaseView(selectedPhase.phaseId, event.target.value as PortableViewType)}
                  >
                    <option value="front">front</option>
                    <option value="side">side</option>
                    <option value="rear">rear</option>
                    <option value="three-quarter">three-quarter</option>
                  </select>
                </label>
              </section>

              <section className="card" style={{ minHeight: "92px" }}>
                <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Joint editor</h3>
                <label style={labelStyle}>
                  <span>Selected joint</span>
                  <select
                    value={selectedJointName ?? ""}
                    style={inputStyle}
                    onChange={(event) => selectJoint((event.target.value || null) as CanonicalJointName | null)}
                  >
                    <option value="">None</option>
                    {CANONICAL_JOINTS.map((joint) => (
                      <option key={joint.name} value={joint.name}>
                        {joint.label}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedJointName ? (
                  <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.5rem" }}>
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
                      <button type="button" style={smallButton} onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, 0, -NUDGE_STEP)}>
                        ↑
                      </button>
                      <button type="button" style={smallButton} onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, -NUDGE_STEP, 0)}>
                        ←
                      </button>
                      <button type="button" style={smallButton} onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, NUDGE_STEP, 0)}>
                        →
                      </button>
                      <button type="button" style={smallButton} onClick={() => nudgeJoint(selectedPhase.phaseId, selectedJointName, 0, NUDGE_STEP)}>
                        ↓
                      </button>
                      <button type="button" style={smallButton} onClick={() => revertSelectedJoint(selectedPhase.phaseId, selectedJointName)}>
                        Revert joint
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="muted" style={{ marginBottom: 0 }}>
                    Select a joint from canvas or dropdown to edit coordinates.
                  </p>
                )}
              </section>

              <DetectionWorkflowPanel phaseId={selectedPhase.phaseId} />

              <section className="card" style={{ minHeight: "92px" }}>
                <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Phase asset refs</h3>
                {selectedPhase.assetRefs.length > 0 ? (
                  <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
                    {selectedPhase.assetRefs.map((asset) => (
                      <li key={asset.assetId}>
                        {asset.type} • {asset.assetId} • {asset.uri}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    No source assets on this phase. Overlay/image rendering remains intentionally deferred.
                  </p>
                )}
              </section>

              {poseModel.warnings.length > 0 ? (
                <section className="card" style={{ minHeight: "92px", borderColor: "rgba(233, 180, 116, 0.55)" }}>
                  <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Pose data warnings</h3>
                  <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
                    {poseModel.warnings.map((warning, index) => (
                      <li key={`${warning}-${index}`}>{warning}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : (
            <section className="card">
              <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Pose canvas</h3>
              <p className="muted" style={{ margin: 0 }}>
                No phase selected. Choose a phase in the workspace to render and edit the canonical pose surface.
              </p>
            </section>
          )}

          <section className="card" style={{ minHeight: "92px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "0.4rem", fontSize: "0.95rem" }}>Validation issues</h3>
            {selectedPackage.validation.issues.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No validation issues.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "1rem" }}>
                {selectedPackage.validation.issues.map((issue, index) => (
                  <li key={`${issue.path}-${index}`} className="muted">
                    [{issue.severity}] {issue.path}: {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
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
