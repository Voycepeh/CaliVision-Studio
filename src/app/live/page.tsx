import { Suspense } from "react";
import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { LiveStreamingWorkspace } from "@/components/live/LiveStreamingWorkspace";

export default function LivePage() {
  return (
    <RoutePageIntro
      navActive="live"
      title="Live Streaming"
      description="Run a browser camera session with lightweight live analysis, retain timestamped trace events, then export annotated replay without routing through Upload Video."
    >
      <Suspense fallback={<div className="text-sm text-slate-500">Loading live workspace…</div>}>
        <LiveStreamingWorkspace />
      </Suspense>
    </RoutePageIntro>
  );
}
