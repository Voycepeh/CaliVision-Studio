import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { StudioExperience } from "@/components/studio/StudioExperience";

/**
 * Flagship Studio route for editing drill drafts and handling drill-file compatibility import/export.
 */
export default async function StudioPage({
  searchParams
}: {
  searchParams: Promise<{ packageId?: string; draftId?: string; drillId?: string; versionId?: string; hostedDraftId?: string }>;
}) {
  const params = await searchParams;
  const hasRouteContext = Boolean(params.packageId || params.draftId || params.drillId || params.versionId || params.hostedDraftId);
  return (
    <RoutePageIntro
      navActive={hasRouteContext ? "studio" : undefined}
      title="Drill Studio"
      description="Edit the current drill draft. Open Studio from Library or Create New Drill to load editing context."
    >
      <StudioExperience
        initialPackageId={params.packageId}
        initialDraftId={params.draftId}
        initialDrillId={params.drillId}
        initialVersionId={params.versionId}
        initialHostedDraftId={params.hostedDraftId}
      />
    </RoutePageIntro>
  );
}
