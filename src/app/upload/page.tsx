import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { UploadVideoOverview } from "@/components/upload/UploadVideoOverview";

export default function UploadPage() {
  return (
    <RoutePageIntro
      title="Upload Video"
      description="Browser-first Upload Video flow for building drill drafts and references. This route is structured for future processing while staying honest about current local-first limitations."
    >
      <UploadVideoOverview />
    </RoutePageIntro>
  );
}
