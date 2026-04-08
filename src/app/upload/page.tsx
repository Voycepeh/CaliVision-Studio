import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { UploadVideoWorkspace } from "@/components/upload/UploadVideoWorkspace";

export default function UploadPage() {
  return (
    <RoutePageIntro
      navActive="upload"
      title="Upload Video"
      description="Upload a video or capture from your browser camera, then run local MediaPipe pose analysis with annotated replay and downloadable artifacts."
    >
      <UploadVideoWorkspace />
    </RoutePageIntro>
  );
}
