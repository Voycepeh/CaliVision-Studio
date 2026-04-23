import { Suspense } from "react";
import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { LiveStreamingWorkspace } from "@/components/live/LiveStreamingWorkspace";

export default function LivePage() {
  return (
    <RoutePageIntro
      navActive="live"
      eyebrow="Live & Compare"
      statusLabel="Shipped live core · Partial compare depth"
      title="Live Review"
      description="Run live capture with drill-aware overlay, then review replay outcomes with benchmark-aware compare guidance."
    >
      <Suspense fallback={<div className="text-sm text-slate-500">Loading live workspace…</div>}>
        <LiveStreamingWorkspace />
      </Suspense>
    </RoutePageIntro>
  );
}
