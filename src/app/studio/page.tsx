import { RoutePageIntro } from "@/components/layout/RoutePageIntro";
import { StudioExperience } from "@/components/studio/StudioExperience";

/**
 * Flagship Studio route for editing drill drafts and handling drill-file compatibility import/export.
 */
export default async function StudioPage({
  searchParams
}: {
  searchParams: Promise<{ packageId?: string; draftId?: string; hostedDraftId?: string }>;
}) {
  const params = await searchParams;
  return (
    <RoutePageIntro
      navActive="studio"
      title="Drill Studio"
      description="Edit your drill draft top-to-bottom, from drill info and phase pose authoring through review, export, and technical details."
    >
      <StudioExperience initialPackageId={params.packageId} initialDraftId={params.draftId} initialHostedDraftId={params.hostedDraftId} />
    </RoutePageIntro>
  );
}
