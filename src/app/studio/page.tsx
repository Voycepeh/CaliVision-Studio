import { StudioExperience } from "@/components/studio/StudioExperience";

/**
 * Flagship Studio route for drill draft editing and drill-file import/export workflows.
 */
export default async function StudioPage({
  searchParams
}: {
  searchParams: Promise<{ packageId?: string; draftId?: string }>;
}) {
  const params = await searchParams;
  return <StudioExperience initialPackageId={params.packageId} initialDraftId={params.draftId} />;
}
