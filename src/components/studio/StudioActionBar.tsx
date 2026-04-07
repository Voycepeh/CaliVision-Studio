"use client";

import { useRef } from "react";
import type { ChangeEvent } from "react";
import { useStudioState } from "@/components/studio/StudioState";
import { useAuth } from "@/lib/auth/AuthProvider";

export function StudioActionBar() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    importFromFile,
    exportSelectedPackage,
    saveStatusLabel,
    openPublishPanel,
    selectedPackage,
    duplicateSelectedPackage,
    forkSelectedPackage,
    createSelectedPackageNewVersion,
    saveSelectedToHosted,
    hostedSaveStatusMessage
  } = useStudioState();
  const { userEmail, isConfigured } = useAuth();
  const isDirty = saveStatusLabel.startsWith("Unsaved");

  async function onImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await importFromFile(file);
    event.target.value = "";
  }

  return (
    <section className="card studio-action-bar" aria-label="Studio draft actions">
      <div className="studio-action-bar-status">
        <strong>Draft actions</strong>
        <span className="pill">Studio mode</span>
        <span style={{ color: isDirty ? "#f0b47d" : "var(--success)", fontSize: "0.85rem" }}>{saveStatusLabel}</span>
        <span className="muted" style={{ fontSize: "0.78rem" }}>{hostedSaveStatusMessage}</span>
      </div>

      <div className="studio-action-groups" role="group" aria-label="Import export and sharing actions">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json,.cvpkg.json"
          style={{ display: "none" }}
          onChange={onImportFileChange}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} className="studio-button studio-button-primary">
          Open drill file
        </button>
        <button type="button" onClick={exportSelectedPackage} className="studio-button studio-button-primary" disabled={!selectedPackage}>
          Export drill
        </button>
        <button type="button" onClick={() => void saveSelectedToHosted()} className="studio-button" disabled={!selectedPackage || !userEmail || !isConfigured}>
          Save draft
        </button>
        <button type="button" onClick={openPublishPanel} className="studio-button" disabled={!selectedPackage}>
          Share to Exchange (Mock)
        </button>
      </div>

      <div className="studio-action-groups" role="group" aria-label="Draft and versioning actions">
        <button type="button" onClick={duplicateSelectedPackage} className="studio-button" disabled={!selectedPackage}>
          Save copy
        </button>
        <button type="button" onClick={forkSelectedPackage} className="studio-button" disabled={!selectedPackage}>
          Fork / Remix
        </button>
        <button type="button" onClick={createSelectedPackageNewVersion} className="studio-button" disabled={!selectedPackage}>
          Create revision
        </button>
      </div>
    </section>
  );
}
