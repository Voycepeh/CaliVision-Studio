"use client";

import { useMemo, useState } from "react";
import { StudioAnimationPreviewPanel } from "@/components/studio/animation/StudioAnimationPreviewPanel";
import { useStudioState } from "@/components/studio/StudioState";
import { getSortedPhases } from "@/lib/editor/package-editor";

type ReviewTab = "preview" | "validation";

const TAB_OPTIONS: Array<{ id: ReviewTab; label: string }> = [
  { id: "preview", label: "Preview" },
  { id: "validation", label: "Validation" }
];

export function StudioReviewTabs() {
  const { selectedPackage, selectedPhaseId, selectedPhaseSourceImage, selectedPhaseDetection } = useStudioState();
  const [activeTab, setActiveTab] = useState<ReviewTab>("preview");

  const selectedPhase = useMemo(() => {
    if (!selectedPackage) {
      return null;
    }

    return getSortedPhases(selectedPackage.workingPackage).find((phase) => phase.phaseId === selectedPhaseId) ?? null;
  }, [selectedPackage, selectedPhaseId]);

  return (
    <section style={{ display: "grid", gap: "0.6rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Review</h3>
        <div className="studio-tab-row" role="tablist" aria-label="Review tools">
          {TAB_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={activeTab === option.id}
              className={activeTab === option.id ? "active" : ""}
              onClick={() => setActiveTab(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "preview" ? <StudioAnimationPreviewPanel /> : null}

      {activeTab === "validation" ? (
        selectedPackage ? (
          <div style={{ display: "grid", gap: "0.65rem" }}>
            <div className="card" style={{ display: "grid", gap: "0.4rem" }}>
              <h4 style={{ margin: 0, fontSize: "0.9rem" }}>Validation summary</h4>
              <ul className="muted" style={{ margin: 0, paddingLeft: "1rem" }}>
                <li>Valid drill file: {selectedPackage.validation.isValid ? "yes" : "no"}</li>
                <li>Errors: {selectedPackage.validation.errors.length}</li>
                <li>Warnings: {selectedPackage.validation.warnings.length}</li>
                <li>Dirty state: {selectedPackage.isDirty ? "unsaved changes" : "saved"}</li>
              </ul>
            </div>

            {selectedPackage.validation.issues.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No validation issues.
              </p>
            ) : (
              <div className="card" style={{ display: "grid", gap: "0.35rem" }}>
                <h4 style={{ margin: 0, fontSize: "0.9rem" }}>Issues</h4>
                <ul style={{ margin: 0, paddingLeft: "1rem" }}>
                  {selectedPackage.validation.issues.map((issue, index) => (
                    <li key={`${issue.path}-${index}`} className="muted">
                      [{issue.severity}] {issue.path}: {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedPhase ? (
              <div className="card" style={{ display: "grid", gap: "0.35rem" }}>
                <h4 style={{ margin: 0, fontSize: "0.9rem" }}>Selected phase checks</h4>
                <ul style={{ margin: 0, paddingLeft: "1rem" }}>
                  {selectedPhaseSourceImage && !selectedPhase.poseSequence[0] ? <li className="muted">Source image exists but no canonical pose is applied yet.</li> : null}
                  {!selectedPhaseSourceImage && selectedPhase.poseSequence[0] ? (
                    <li className="muted">Canonical pose exists without a local source image reference for visual alignment.</li>
                  ) : null}
                  {selectedPhaseDetection.status === "failed" ? <li className="muted">Image detection failed for this phase. Review image quality or remap manually.</li> : null}
                  {!selectedPhaseSourceImage && !selectedPhase.poseSequence[0] ? <li className="muted">No source image and no pose data available yet for this phase.</li> : null}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Load a drill file to review validation and authoring warnings.
          </p>
        )
      ) : null}
    </section>
  );
}
