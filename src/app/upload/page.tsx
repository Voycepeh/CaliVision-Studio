import { Suspense } from "react";
import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { UploadVideoWorkspace } from "@/components/upload/UploadVideoWorkspace";

export default function UploadPage() {
  return (
    <RoutePageIntro
      navActive="upload"
      eyebrow="Analysis"
      statusLabel="Shipped · Review foundation"
      title="Upload Video"
      description="Upload Analysis for drill-aware review: select a drill, process footage in-browser, and inspect key metrics, timeline phases, and benchmark feedback."
    >
      <Suspense fallback={<div className="text-sm text-slate-500">Loading upload workspace…</div>}>
        <UploadVideoWorkspace />
      </Suspense>
    </RoutePageIntro>
  );
}
