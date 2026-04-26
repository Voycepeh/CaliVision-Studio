import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { MarketplaceOverview } from "@/components/library/MarketplaceOverview";

export default function MarketplacePage() {
  return (
    <RoutePageIntro
      navActive="exchange"
      title="Drill Exchange"
      description="Browse published drills from Drill Exchange. You can launch Upload Video or Live Coaching directly, then optionally add drills to My Drills."
    >
      <MarketplaceOverview />
    </RoutePageIntro>
  );
}
