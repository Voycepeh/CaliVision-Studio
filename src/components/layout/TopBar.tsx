"use client";

import Link from "next/link";
import { useRef } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import { CaliVisionLogo } from "@/components/brand/CaliVisionLogo";
import { useStudioState } from "@/components/studio/StudioState";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getPrimaryDrill } from "@/lib/editor/package-editor";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/library", label: "Library" },
  { href: "/studio", label: "Drill Studio" },
  { href: "/upload", label: "Upload Video" },
  { href: "/marketplace", label: "Exchange" },
  { href: "/#android-app", label: "Download app" }
];

export function TopBar() {
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
    hostedSaveStatusMessage,
    persistenceMode
  } = useStudioState();
  const { userEmail, isConfigured } = useAuth();
  const isDirty = saveStatusLabel.startsWith("Unsaved");
  const selectedDrill = selectedPackage ? getPrimaryDrill(selectedPackage.workingPackage) : null;
  const draftHeader = selectedDrill?.title ?? "No drill selected";

  async function onImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await importFromFile(file);
    event.target.value = "";
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--border)",
        padding: "0.8rem 1rem",
        background: "rgba(10,15,24,0.92)",
        backdropFilter: "blur(4px)",
        gap: "1rem"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.35rem" }}>
            <CaliVisionLogo size="compact" className="topbar-brand-logo" />
            <span style={{ fontSize: "0.82rem", color: "var(--muted)", letterSpacing: "0.02em" }}>CaliVision</span>
          </div>
          <strong>{draftHeader}</strong>
          <p style={{ margin: "0.2rem 0 0", color: "var(--muted)", fontSize: "0.8rem" }}>
            Editing drill draft in CaliVision
          </p>
          <p style={{ margin: "0.2rem 0 0", color: "var(--muted)", fontSize: "0.75rem" }}>
            {isConfigured ? userEmail ? `Signed in: ${userEmail}` : "Not signed in (hosted save unavailable)" : "Supabase not configured: local-only mode"}
          </p>
          <p style={{ margin: "0.2rem 0 0", color: "var(--muted)", fontSize: "0.75rem" }}>
            Storage mode: {persistenceMode === "cloud" ? "Cloud workspace" : "Browser workspace"}
          </p>
        </div>
        <nav style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="pill">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
        <span style={{ color: isDirty ? "#f0b47d" : "var(--success)", fontSize: "0.85rem" }}>{saveStatusLabel}</span>
        <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>{hostedSaveStatusMessage}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json,.cvpkg.json"
          style={{ display: "none" }}
          onChange={onImportFileChange}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} style={actionButtonStyle}>
          Open drill file
        </button>
        <button type="button" onClick={exportSelectedPackage} style={actionButtonStyle}>
          Export drill
        </button>
        <button type="button" onClick={() => void saveSelectedToHosted()} style={actionButtonStyle} disabled={!selectedPackage || persistenceMode !== "cloud" || !userEmail || !isConfigured}>
          {persistenceMode === "cloud" ? "Save to account" : "Cloud save (sign in)"}
        </button>
        <button type="button" onClick={openPublishPanel} style={actionButtonStyle}>
          Share to Exchange (Mock)
        </button>
        <button type="button" onClick={duplicateSelectedPackage} style={actionButtonStyle} disabled={!selectedPackage}>
          Save copy
        </button>
        <button type="button" onClick={forkSelectedPackage} style={actionButtonStyle} disabled={!selectedPackage}>
          Fork / Remix
        </button>
        <button type="button" onClick={createSelectedPackageNewVersion} style={actionButtonStyle} disabled={!selectedPackage}>
          Create revision
        </button>
      </div>
    </header>
  );
}

const actionButtonStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "0.6rem",
  background: "var(--panel-elevated)",
  color: "var(--text)",
  padding: "0.45rem 0.75rem",
  cursor: "pointer"
};
