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
          Studio opens when you launch it from Library or create a new drill.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "0.45rem", flexWrap: "wrap" }}>
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
  initialHostedDraftId,
  initialIntent
}: {
  initialPackageId?: string;
  initialDraftId?: string;
  initialDrillId?: string;
  initialVersionId?: string;
  initialHostedDraftId?: string;
  initialIntent?: "create";
}) {
  return (
    <StudioStateProvider
      initialPackageId={initialPackageId}
      initialDraftId={initialDraftId}
      initialDrillId={initialDrillId}
      initialVersionId={initialVersionId}
      initialHostedDraftId={initialHostedDraftId}
      requireDrillContext={true}
    >
      <div className="studio-route-surface">
        {initialIntent === "create" ? (
          <section className="card" style={{ marginBottom: "0.6rem", padding: "0.6rem 0.8rem", display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
            <strong>New drill draft</strong>
            <span className="pill">Create flow</span>
          </section>
        ) : null}
        <StudioEmptyState />
      </div>
    </StudioStateProvider>
  );
}
