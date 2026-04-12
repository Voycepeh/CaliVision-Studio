import { Suspense } from "react";
import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { LiveStreamingWorkspace } from "@/components/live/LiveStreamingWorkspace";

export default function LivePage() {
  return (
    <RoutePageIntro
      navActive="live"
      title="Live Streaming"
      description="Pick a drill, start a browser camera session, and receive live drill-aware overlay feedback with replay metrics after capture."
    >
      <Suspense fallback={<div className="text-sm text-slate-500">Loading live workspace…</div>}>
        <LiveStreamingWorkspace />
      </Suspense>
    </RoutePageIntro>
  );
}
