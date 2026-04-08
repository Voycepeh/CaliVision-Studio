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
  return (
    <RoutePageIntro
      navActive="studio"
      title="Drill Studio"
      description="Edit the currently selected drill draft top-to-bottom, from drill info and phase pose authoring through review."
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
