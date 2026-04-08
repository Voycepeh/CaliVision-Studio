import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { LibraryOverview } from "@/components/library/LibraryOverview";

export default function LibraryPage() {
  return (
    <RoutePageIntro
      title="Library"
      description="Manage My drills with one unified library, per-version status, and version history foundations."
      navActive="library"
    >
      <LibraryOverview />
    </RoutePageIntro>
  );
}
