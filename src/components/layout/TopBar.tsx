"use client";

import Link from "next/link";
import { useRef } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import { useStudioState } from "@/components/studio/StudioState";
import { getPrimaryDrill } from "@/lib/editor/package-editor";
import { summarizeProvenance } from "@/lib/package";

const navItems = [
  { href: "/library", label: "Library" },
  { href: "/studio", label: "Studio" },
  { href: "/upload", label: "Upload" },
  { href: "/marketplace", label: "Exchange" }
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
  const drillTitle = selectedPackage ? getPrimaryDrill(selectedPackage.workingPackage)?.title ?? "Untitled drill" : "No drill selected";
  const drillSubline = selectedPackage
    ? `${selectedPackage.isDirty ? "Draft has unsaved changes" : "Draft saved locally"} • v${selectedPackage.workingPackage.manifest.packageVersion}`
    : "Open a drill from Library to begin.";
  const provenance = selectedPackage ? summarizeProvenance(selectedPackage.workingPackage) : "";

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
            Editing: {drillTitle}
          </p>
          <p style={{ margin: "0.2rem 0 0", color: "var(--muted)", fontSize: "0.75rem" }}>
            {drillSubline}{provenance ? ` • ${provenance}` : ""}
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
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json,.cvpkg.json"
          style={{ display: "none" }}
          onChange={onImportFileChange}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} style={actionButtonStyle}>
          Import drill file
        </button>
        <button type="button" onClick={exportSelectedPackage} style={actionButtonStyle}>
          Export drill
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
