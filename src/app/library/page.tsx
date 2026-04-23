import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { LibraryOverview } from "@/components/library/LibraryOverview";

export default function LibraryPage() {
  return (
    <RoutePageIntro
      eyebrow="Dashboard"
      statusLabel="Shipped · Core workflow"
      title="Dashboard"
      description="Use Dashboard as your workspace hub: select a drill, open Drill Studio, run Upload Analysis, or launch Live & Compare."
      navActive="library"
    >
      <LibraryOverview />
    </RoutePageIntro>
  );
}
