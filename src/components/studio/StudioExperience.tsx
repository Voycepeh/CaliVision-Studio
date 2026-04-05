"use client";

import { StudioLayout } from "@/components/layout/StudioLayout";
import { InspectorPanel } from "@/components/studio/InspectorPanel";
import { LibraryPanel } from "@/components/studio/LibraryPanel";
import { StudioStateProvider } from "@/components/studio/StudioState";
import { WorkspacePanel } from "@/components/studio/WorkspacePanel";

export function StudioExperience() {
  return (
    <StudioStateProvider>
      <StudioLayout left={<LibraryPanel />} center={<WorkspacePanel />} right={<InspectorPanel />} />
    </StudioStateProvider>
  );
}
