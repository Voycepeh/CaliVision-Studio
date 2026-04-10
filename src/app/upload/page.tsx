import { Suspense } from "react";
import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { UploadVideoWorkspace } from "@/components/upload/UploadVideoWorkspace";

export default function UploadPage() {
  return (
    <RoutePageIntro
      navActive="upload"
      title="Upload Video"
      description="Upload one or more videos and run local browser-based MediaPipe pose analysis with downloadable overlays and JSON artifacts."
    >
      <Suspense fallback={<div className="text-sm text-slate-500">Loading upload workspace…</div>}>
        <UploadVideoWorkspace />
      </Suspense>
    </RoutePageIntro>
  );
}
