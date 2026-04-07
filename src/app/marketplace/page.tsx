import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { MarketplaceOverview } from "@/components/library/MarketplaceOverview";

export default function MarketplacePage() {
  return (
    <RoutePageIntro
      navActive="exchange"
      title="Drill Exchange"
      description="Discovery and sharing surface for community drills. Currently local/mock-backed, designed to evolve into hosted Exchange workflows without changing package compatibility."
    >
      <MarketplaceOverview />
    </RoutePageIntro>
  );
}
