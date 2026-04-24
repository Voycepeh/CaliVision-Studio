import { Suspense } from "react";
import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { LiveStreamingWorkspace } from "@/components/live/LiveStreamingWorkspace";

export default function LivePage() {
  return (
    <RoutePageIntro
      navActive="live"
      title="Live Training Cockpit"
      description="Pick a drill, start your camera stream, and train with live phase tracking, rep or hold metrics, coaching cues, and built-in audio signals."
    >
      <Suspense fallback={<div className="text-sm text-slate-500">Loading live workspace…</div>}>
        <LiveStreamingWorkspace />
      </Suspense>
    </RoutePageIntro>
  );
}
