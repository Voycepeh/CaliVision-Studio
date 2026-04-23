import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { MarketplaceOverview } from "@/components/library/MarketplaceOverview";

export default function MarketplacePage() {
  return (
    <RoutePageIntro
      navActive="exchange"
      eyebrow="Drills"
      statusLabel="Partial · Discovery"
      title="Drill Exchange"
      description="Browse published drills from Drill Exchange, preview details, and add drills into My Library when you choose."
    >
      <MarketplaceOverview />
    </RoutePageIntro>
  );
}
