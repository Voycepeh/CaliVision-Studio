import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { MarketplaceOverview } from "@/components/library/MarketplaceOverview";

export default function MarketplacePage() {
  return (
    <RoutePageIntro
      navActive="exchange"
      title="Drill Exchange"
      description="Browse published drills from Drill Exchange, open drill details, and fork/remix into your own library workflow."
    >
      <MarketplaceOverview />
    </RoutePageIntro>
  );
}
