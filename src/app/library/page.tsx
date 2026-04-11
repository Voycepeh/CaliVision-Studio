import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { LibraryOverview } from "@/components/library/LibraryOverview";

export default function LibraryPage() {
  return (
    <RoutePageIntro
      title="Library"
      description="Select a drill and jump straight into Live Streaming, Upload Video, or Studio editing from one primary workflow hub."
      navActive="library"
    >
      <LibraryOverview />
    </RoutePageIntro>
  );
}
