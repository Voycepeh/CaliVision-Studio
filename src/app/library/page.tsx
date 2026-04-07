import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { LibraryOverview } from "@/components/library/LibraryOverview";

export default function LibraryPage() {
  return (
    <RoutePageIntro
      title="Library"
      description="Your home base for drills: continue recent work, start a new drill, import/export package files, explore Exchange listings, and jump into Drill Studio."
    >
      <LibraryOverview />
    </RoutePageIntro>
  );
}
