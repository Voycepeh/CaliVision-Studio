"use client";

import { useStudioState } from "@/components/studio/StudioState";
import { useAuth } from "@/lib/auth/AuthProvider";
import Link from "next/link";

export function StudioActionBar() {
  const {
    saveStatusLabel,
    openPublishPanel,
    selectedPackage,
    saveSelectedToHosted,
    hostedSaveStatusMessage
  } = useStudioState();
  const { userEmail, isConfigured } = useAuth();
  const isDirty = saveStatusLabel.startsWith("Unsaved");

  return (
    <section className="card studio-action-bar" aria-label="Studio draft actions">
      <div className="studio-action-bar-status">
        <strong>Draft actions</strong>
        <span className="pill">Studio mode</span>
        <span style={{ color: isDirty ? "#f0b47d" : "var(--success)", fontSize: "0.85rem" }}>{saveStatusLabel}</span>
        <span className="muted" style={{ fontSize: "0.78rem" }}>{hostedSaveStatusMessage}</span>
      </div>

      <div className="studio-action-groups" role="group" aria-label="Editing actions">
        <button type="button" onClick={() => void saveSelectedToHosted()} className="studio-button" disabled={!selectedPackage || !userEmail || !isConfigured}>
          Save draft
        </button>
        <Link href="/library" className="pill">
          Back to Library
        </Link>
        <details>
          <summary className="studio-button">More</summary>
          <div style={{ marginTop: "0.4rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <button type="button" onClick={openPublishPanel} className="studio-button" disabled={!selectedPackage}>
              Share to Exchange (Mock)
            </button>
          </div>
        </details>
      </div>
    </section>
  );
}
