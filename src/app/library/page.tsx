import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { LibraryOverview } from "@/components/library/LibraryOverview";

export default function LibraryPage() {
  return (
    <RoutePageIntro
      eyebrow="Dashboard"
      statusLabel="Shipped · Core workflow"
      title="Drill Library"
      description="Use Drill Library as your workspace hub: select a drill, open Drill Studio, run Upload Analysis, or enter Benchmark Compare posture."
      navActive="library"
    >
      <LibraryOverview />
    </RoutePageIntro>
  );
}
