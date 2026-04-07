import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { PackageOverview } from "@/components/package/PackageOverview";

export default function PackagesPage() {
  return (
    <RoutePageIntro
      navActive="packages"
      title="Package Tools"
      description="Technical portability workspace for importing/exporting portable drill packages and checking transport compatibility."
    >
      <PackageOverview />
    </RoutePageIntro>
  );
}
