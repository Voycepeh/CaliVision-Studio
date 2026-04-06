"use client";

import { StudioResizableLayout } from "@/components/layout/StudioResizableLayout";
import { LibraryPanel } from "@/components/studio/LibraryPanel";
import { StudioCenterInspector } from "@/components/studio/StudioCenterInspector";
import { StudioRightPanel } from "@/components/studio/StudioRightPanel";
import { StudioStateProvider } from "@/components/studio/StudioState";

export function StudioExperience({ initialPackageId }: { initialPackageId?: string }) {
  return (
    <StudioStateProvider initialPackageId={initialPackageId}>
      <StudioResizableLayout left={<LibraryPanel />} center={<StudioCenterInspector />} right={<StudioRightPanel />} />
    </StudioStateProvider>
  );
}
