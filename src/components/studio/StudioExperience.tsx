"use client";

import Link from "next/link";
import { StudioCenterInspector } from "@/components/studio/StudioCenterInspector";
import { StudioStateProvider, useStudioState } from "@/components/studio/StudioState";

function StudioEmptyState() {
  const { selectedPackage } = useStudioState();
  if (selectedPackage) {
    return <StudioCenterInspector />;
  }

  return (
    <section className="panel" style={{ padding: "1rem" }}>
      <div className="card" style={{ maxWidth: "640px", margin: "0 auto", display: "grid", gap: "0.65rem", textAlign: "center" }}>
        <h2 style={{ margin: 0 }}>No drill selected</h2>
        <p className="muted" style={{ margin: 0 }}>
          Choose a drill from Library to start editing.
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Link href="/library" className="pill" style={{ fontWeight: 600 }}>
            Go to Library
          </Link>
        </div>
      </div>
    </section>
  );
}

export function StudioExperience({
  initialPackageId,
  initialDraftId,
  initialDrillId,
  initialVersionId,
  initialHostedDraftId
}: {
  initialPackageId?: string;
  initialDraftId?: string;
  initialDrillId?: string;
  initialVersionId?: string;
  initialHostedDraftId?: string;
}) {
  return (
    <StudioStateProvider
      initialPackageId={initialPackageId}
      initialDraftId={initialDraftId}
      initialDrillId={initialDrillId}
      initialVersionId={initialVersionId}
      initialHostedDraftId={initialHostedDraftId}
    >
      <div className="studio-route-surface">
        <StudioEmptyState />
      </div>
    </StudioStateProvider>
  );
}
