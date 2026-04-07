import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { LibraryOverview } from "@/components/library/LibraryOverview";

export default function LibraryPage() {
  return (
    <RoutePageIntro
      title="Library"
      description="Create a new drill, continue local drafts, open saved drills, import drill files, and jump into Studio."
      navActive="library"
    >
      <LibraryOverview />
    </RoutePageIntro>
  );
}
