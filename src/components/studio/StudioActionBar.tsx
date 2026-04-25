"use client";

import { useStudioState } from "@/components/studio/StudioState";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRouter } from "next/navigation";

export function StudioActionBar() {
  const router = useRouter();
  const {
    saveStatusLabel,
    draftVersionLabel,
    selectedPackage,
    readinessChecklist,
    saveSelectedDraft,
    markSelectedVersionReady,
    persistenceMode
  } = useStudioState();
  const { userEmail, isConfigured } = useAuth();
  const isDirty = selectedPackage?.isDirty === true;

  function handleBackToLibrary(): void {
    if (isDirty) {
      const confirmed = window.confirm("You have unsaved changes. Leave Drill Studio without saving?");
      if (!confirmed) {
        return;
      }
    }
    router.push("/library");
  }

  return (
    <section className="card studio-action-bar" aria-label="Studio draft actions">
      <div className="studio-action-bar-status">
        <strong>Drill version actions</strong>
        <span className="pill">{persistenceMode === "cloud" ? "Cloud workspace" : "Browser workspace"}</span>
        <span className="muted" style={{ fontSize: "0.8rem" }}>{draftVersionLabel}</span>
        <span style={{ color: isDirty ? "#f0b47d" : "var(--success)", fontSize: "0.85rem" }}>{saveStatusLabel}</span>
      </div>

      <div className="studio-action-groups" role="group" aria-label="Editing actions">
        <button type="button" onClick={() => void saveSelectedDraft()} className="studio-button" disabled={!selectedPackage || (persistenceMode === "cloud" && (!userEmail || !isConfigured))}>
          {persistenceMode === "cloud" ? "Save draft" : "Save draft (local)"}
        </button>
        <button type="button" onClick={() => void markSelectedVersionReady()} className="studio-button" disabled={!selectedPackage}>
          Mark Ready
        </button>
        <button type="button" onClick={handleBackToLibrary} className="pill">
          Back to Library
        </button>
      </div>

      {selectedPackage && readinessChecklist && !readinessChecklist.isReady ? (
        <div style={{ gridColumn: "1 / -1" }}>
          <p className="muted" style={{ margin: "0.35rem 0 0.25rem 0", fontSize: "0.8rem" }}>
            Complete required fields before Mark Ready:
          </p>
          <ul style={{ margin: 0, paddingLeft: "1rem" }}>
            {readinessChecklist.issues.map((issue) => (
              <li key={issue.code} className="muted" style={{ fontSize: "0.8rem" }}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
