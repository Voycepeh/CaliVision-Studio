"use client";

import { StudioResizableLayout } from "@/components/layout/StudioResizableLayout";
import { LibraryPanel } from "@/components/studio/LibraryPanel";
import { StudioCenterInspector } from "@/components/studio/StudioCenterInspector";
import { StudioRightPanel } from "@/components/studio/StudioRightPanel";
import { StudioStateProvider } from "@/components/studio/StudioState";

export function StudioExperience({
  initialPackageId,
  initialDraftId,
  initialHostedDraftId
}: {
  initialPackageId?: string;
  initialDraftId?: string;
  initialHostedDraftId?: string;
}) {
  return (
    <StudioStateProvider initialPackageId={initialPackageId} initialDraftId={initialDraftId} initialHostedDraftId={initialHostedDraftId}>
      <div className="studio-route-surface">
        <StudioResizableLayout left={<LibraryPanel />} center={<StudioCenterInspector />} right={<StudioRightPanel />} />
      </div>
    </StudioStateProvider>
  );
}
