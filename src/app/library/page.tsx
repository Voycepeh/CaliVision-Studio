import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { LibraryOverview } from "@/components/library/LibraryOverview";

export default function LibraryPage() {
  return (
    <RoutePageIntro
      title="Library"
      description="Manage Drafts and My drills as your main entry into Drill Studio workflows."
      navActive="library"
    >
      <LibraryOverview />
    </RoutePageIntro>
  );
}
