"use client";

import { StudioMetadataEditor } from "@/components/studio/StudioMetadataEditor";
import { StudioPhaseDetailsPanel } from "@/components/studio/StudioPhaseDetailsPanel";

export function StudioRightPanel() {
  return (
    <div style={{ display: "grid", gap: "0.8rem", maxHeight: "100%", overflowY: "auto" }}>
      <div className="panel-content" style={{ paddingBottom: 0 }}>
        <StudioMetadataEditor />
      </div>
      <StudioPhaseDetailsPanel />
    </div>
  );
}
