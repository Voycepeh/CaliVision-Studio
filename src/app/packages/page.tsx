import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { PackageOverview } from "@/components/package/PackageOverview";

export default function PackagesPage() {
  return (
    <RoutePageIntro
      title="Packages"
      description="Artifact transport and compatibility workspace for portable drill package files (import/export/bundling semantics), distinct from Library browsing and Marketplace discovery."
    >
      <PackageOverview />
    </RoutePageIntro>
  );
}
