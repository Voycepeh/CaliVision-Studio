import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { LibraryOverview } from "@/components/library/LibraryOverview";

export default function LibraryPage() {
  return (
    <RoutePageIntro
      title="Library"
      description="Main local package management surface for authored/imported/installed portable drill packages with local-first registry-style browsing."
    >
      <LibraryOverview />
    </RoutePageIntro>
  );
}
