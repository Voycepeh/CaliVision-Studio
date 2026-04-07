import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { LibraryOverview } from "@/components/library/LibraryOverview";

export default function LibraryPage() {
  return (
    <RoutePageIntro
      title="Library"
      description="Manage local drafts, saved drills, and your main entry into Drill Studio workflows."
      navActive="library"
    >
      <LibraryOverview />
    </RoutePageIntro>
  );
}
