import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { MarketplaceOverview } from "@/components/library/MarketplaceOverview";

export default function MarketplacePage() {
  return (
    <RoutePageIntro
      title="Marketplace"
      description="Future hosted Drill Exchange package discovery route. Currently powered by local/mock registry listings to establish marketplace mental models before backend integration."
    >
      <MarketplaceOverview />
    </RoutePageIntro>
  );
}
