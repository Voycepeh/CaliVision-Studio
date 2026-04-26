import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { LibraryOverview } from "@/components/library/LibraryOverview";
import { MarketplaceOverview } from "@/components/library/MarketplaceOverview";

export default function LibraryPage() {
  return (
    <RoutePageIntro
      title="Drills"
      description="Explore Drill Exchange first to launch Upload Video or Live Coaching quickly. Use My Drills for custom authoring, drafts, imports, and private drill management."
      navActive="library"
    >
      <MarketplaceOverview />
      <LibraryOverview />
    </RoutePageIntro>
  );
}
