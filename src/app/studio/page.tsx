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
  return <StudioExperience initialPackageId={params.packageId} initialDraftId={params.draftId} initialHostedDraftId={params.hostedDraftId} />;
}
