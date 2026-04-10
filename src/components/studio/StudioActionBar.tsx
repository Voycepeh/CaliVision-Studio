"use client";

import { useStudioState } from "@/components/studio/StudioState";
import { useAuth } from "@/lib/auth/AuthProvider";
import Link from "next/link";

export function StudioActionBar() {
  const {
    saveStatusLabel,
    draftVersionLabel,
    selectedPackage,
    saveSelectedToHosted,
    markSelectedVersionReady,
    persistenceMode
  } = useStudioState();
  const { userEmail, isConfigured } = useAuth();
  const isDirty = saveStatusLabel.startsWith("Unsaved");

  return (
    <section className="card studio-action-bar" aria-label="Studio draft actions">
      <div className="studio-action-bar-status">
        <strong>Drill version actions</strong>
        <span className="pill">{persistenceMode === "cloud" ? "Cloud workspace" : "Browser workspace"}</span>
        <span className="muted" style={{ fontSize: "0.8rem" }}>{draftVersionLabel}</span>
        <span style={{ color: isDirty ? "#f0b47d" : "var(--success)", fontSize: "0.85rem" }}>{saveStatusLabel}</span>
      </div>

      <div className="studio-action-groups" role="group" aria-label="Editing actions">
        <button type="button" onClick={() => void saveSelectedToHosted()} className="studio-button" disabled={!selectedPackage || persistenceMode !== "cloud" || !userEmail || !isConfigured}>
          {persistenceMode === "cloud" ? "Save draft" : "Cloud save (sign in)"}
        </button>
        <button type="button" onClick={() => void markSelectedVersionReady()} className="studio-button" disabled={!selectedPackage}>
          Mark Ready
        </button>
        <Link href="/library" className="pill">
          Back to Library
        </Link>
      </div>
    </section>
  );
}
