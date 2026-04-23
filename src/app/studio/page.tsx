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
      eyebrow="Drills"
      statusLabel="Shipped · Authoring core"
      title="Drill Studio"
      description="Edit the current drill draft. Open Studio from Library or Create New Drill to load editing context."
      navActive="studio"
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
