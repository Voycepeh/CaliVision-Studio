import type { AvailableDrillDisplayOption } from "./available-drills";

export type DrillSearchResult = {
  option: AvailableDrillDisplayOption;
  titleMatch: boolean;
  metadataMatch: boolean;
};

function tokenize(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function buildMetadata(option: AvailableDrillDisplayOption): string[] {
  return [
    ...(option.drill.tags ?? []),
    option.drill.drillType,
    option.drill.primaryView,
    option.drill.difficulty
  ]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));
}

export function searchDrillsByOrigin(options: AvailableDrillDisplayOption[], query: string): DrillSearchResult[] {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return options.map((option) => ({ option, titleMatch: true, metadataMatch: false }));
  }

  const scored = options
    .map((option, index) => {
      const title = option.drill.title.toLowerCase();
      const metadata = buildMetadata(option);
      const titleMatchesEveryTerm = terms.every((term) => title.includes(term));
      const metadataMatchesEveryTerm = terms.every((term) => metadata.some((candidate) => candidate.includes(term)));
      const titleMatchCount = terms.reduce((count, term) => count + (title.includes(term) ? 1 : 0), 0);
      const metadataMatchCount = terms.reduce(
        (count, term) => count + (metadata.some((candidate) => candidate.includes(term)) ? 1 : 0),
        0
      );

      if (!titleMatchesEveryTerm && !metadataMatchesEveryTerm) {
        return null;
      }

      return {
        option,
        titleMatch: titleMatchesEveryTerm,
        metadataMatch: !titleMatchesEveryTerm && metadataMatchesEveryTerm,
        rank: titleMatchesEveryTerm ? 0 : 1,
        score: titleMatchCount * 10 + metadataMatchCount,
        index
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .sort((a, b) => {
      if (a.rank !== b.rank) {
        return a.rank - b.rank;
      }
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return a.index - b.index;
    });

  return scored.map(({ option, titleMatch, metadataMatch }) => ({ option, titleMatch, metadataMatch }));
}
