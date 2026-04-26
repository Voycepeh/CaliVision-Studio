import { CompareWorkspace } from "@/components/compare/CompareWorkspace";
import { parseCompareIntentFromObject } from "@/lib/compare/intent";

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const resolvedSearchParams = await searchParams;
  const intent = parseCompareIntentFromObject(resolvedSearchParams);
  return <CompareWorkspace intent={intent} />;
}
