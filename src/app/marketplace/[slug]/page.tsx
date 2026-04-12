import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { MarketplaceDrillDetail } from "@/components/marketplace/MarketplaceDrillDetail";

export default async function MarketplaceDrillDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolved = await params;

  return (
    <RoutePageIntro
      navActive="exchange"
      title="Drill Exchange"
      description="Published drill detail with preview and add-to-library flow."
    >
      <MarketplaceDrillDetail slug={resolved.slug} />
    </RoutePageIntro>
  );
}
