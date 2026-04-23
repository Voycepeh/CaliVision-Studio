import { Suspense } from "react";
import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { LiveStreamingWorkspace } from "@/components/live/LiveStreamingWorkspace";

export default function LivePage() {
  return (
    <RoutePageIntro
      navActive="live"
      eyebrow="Compare"
      statusLabel="Partial · Benchmark posture"
      title="Benchmark Compare"
      description="Run live capture with drill-aware overlay, then compare replay outcomes against benchmark expectations in a responsive coaching workflow."
    >
      <Suspense fallback={<div className="text-sm text-slate-500">Loading live workspace…</div>}>
        <LiveStreamingWorkspace />
      </Suspense>
    </RoutePageIntro>
  );
}
