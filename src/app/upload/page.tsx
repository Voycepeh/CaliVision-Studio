import { Suspense } from "react";
import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { UploadVideoWorkspace } from "@/components/upload/UploadVideoWorkspace";

export default function UploadPage() {
  return (
    <RoutePageIntro
      navActive="upload"
      title="Upload Video"
      description="Select a drill, upload a video, and review drill-aware overlay feedback with reps, holds, and phase transitions."
    >
      <Suspense fallback={<div className="text-sm text-slate-500">Loading upload workspace…</div>}>
        <UploadVideoWorkspace />
      </Suspense>
    </RoutePageIntro>
  );
}
