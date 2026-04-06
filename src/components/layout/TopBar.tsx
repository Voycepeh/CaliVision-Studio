"use client";

import Link from "next/link";
import { useRef } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import { useStudioState } from "@/components/studio/StudioState";
import { summarizeProvenance } from "@/lib/package";

const navItems = [
  { href: "/studio", label: "Studio" },
  { href: "/library", label: "Library" },
  { href: "/packages", label: "Packages" },
  { href: "/marketplace", label: "Marketplace" }
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
    createSelectedPackageNewVersion
  } = useStudioState();
  const isDirty = saveStatusLabel.startsWith("Unsaved");
  const packageHeader = selectedPackage
    ? `${selectedPackage.workingPackage.manifest.packageId} • v${selectedPackage.workingPackage.manifest.packageVersion}`
    : "No package selected";
  const provenance = selectedPackage ? summarizeProvenance(selectedPackage.workingPackage) : "Load a package to begin.";

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
          <strong>CaliVision Studio</strong>
          <p style={{ margin: "0.2rem 0 0", color: "var(--muted)", fontSize: "0.8rem" }}>
            Web-first authoring • drill-first workflow
          </p>
          <p style={{ margin: "0.2rem 0 0", color: "var(--muted)", fontSize: "0.75rem" }}>
            {packageHeader} • {provenance}
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

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <span style={{ color: isDirty ? "#f0b47d" : "var(--success)", fontSize: "0.85rem" }}>{saveStatusLabel}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json,.cvpkg.json"
          style={{ display: "none" }}
          onChange={onImportFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={actionButtonStyle}
        >
          Import Drill Bundle
        </button>
        <button type="button" onClick={exportSelectedPackage} style={actionButtonStyle}>
          Export Drill Bundle
        </button>
        <button type="button" onClick={openPublishPanel} style={actionButtonStyle}>
          Publish
        </button>
        <button type="button" onClick={duplicateSelectedPackage} style={actionButtonStyle} disabled={!selectedPackage}>
          Duplicate
        </button>
        <button type="button" onClick={forkSelectedPackage} style={actionButtonStyle} disabled={!selectedPackage}>
          Fork / Remix
        </button>
        <button type="button" onClick={createSelectedPackageNewVersion} style={actionButtonStyle} disabled={!selectedPackage}>
          New Version
        </button>
        <button type="button" style={actionButtonStyle}>
          Settings/Profile
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
