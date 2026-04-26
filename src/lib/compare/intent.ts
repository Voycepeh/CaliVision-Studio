export type CompareIntent = {
  attemptId?: string;
  drillId?: string;
  compareTo?: "latest" | "personalBest";
};

export function parseCompareIntentFromSearchParams(searchParams: URLSearchParams | ReadonlyURLSearchParams): CompareIntent {
  const attemptId = searchParams.get("attemptId")?.trim() || undefined;
  const drillId = searchParams.get("drillId")?.trim() || undefined;
  const compareToRaw = searchParams.get("compareTo")?.trim();
  const compareTo = compareToRaw === "latest" || compareToRaw === "personalBest" ? compareToRaw : undefined;

  return {
    attemptId,
    drillId,
    compareTo
  };
}

type ReadonlyURLSearchParams = {
  get(name: string): string | null;
};


export function parseCompareIntentFromObject(searchParams: Record<string, string | string[] | undefined>): CompareIntent {
  const resolve = (key: string): string | undefined => {
    const value = searchParams[key];
    if (Array.isArray(value)) return value[0]?.trim() || undefined;
    return value?.trim() || undefined;
  };

  const compareToRaw = resolve("compareTo");
  return {
    attemptId: resolve("attemptId"),
    drillId: resolve("drillId"),
    compareTo: compareToRaw === "latest" || compareToRaw === "personalBest" ? compareToRaw : undefined
  };
}
