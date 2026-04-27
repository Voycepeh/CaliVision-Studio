import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { StudioExperience } from "@/components/studio/StudioExperience";

/**
 * Flagship Studio route for editing drill drafts and handling drill-file compatibility import/export.
 */
export default async function StudioPage({
  searchParams
}: {
  searchParams: Promise<{ packageId?: string; draftId?: string; drillId?: string; versionId?: string; hostedDraftId?: string; intent?: string }>;
}) {
  const params = await searchParams;
  const initialIntent = params.intent === "create" ? "create" : undefined;
  return (
    <RoutePageIntro
      title="Drill Studio"
      description="Edit the current drill draft. Open Studio from My Drills or Create Drill (advanced) to load editing context."
    >
      <StudioExperience
        initialPackageId={params.packageId}
        initialDraftId={params.draftId}
        initialDrillId={params.drillId}
        initialVersionId={params.versionId}
        initialHostedDraftId={params.hostedDraftId}
        initialIntent={initialIntent}
      />
    </RoutePageIntro>
  );
}
