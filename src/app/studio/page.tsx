import { StudioExperience } from "@/components/studio/StudioExperience";

/**
 * Flagship Studio route wired to drill-file local import/export workflow.
 */
export default async function StudioPage({
  searchParams
}: {
  searchParams: Promise<{ packageId?: string }>;
}) {
  const params = await searchParams;
  return <StudioExperience initialPackageId={params.packageId} />;
}
