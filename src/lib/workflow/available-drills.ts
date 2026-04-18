import { buildDrillOptionLabel } from "../drills/labels.ts";
import { summarizeBenchmark } from "../drills/benchmark.ts";
import type { DrillPackage, PortableDrill } from "../schema/contracts.ts";
export {
  buildDrillOptionGroups,
  ensureVisibleDrillSelection,
  persistSelectedDrillKey,
  resolveSelectedSourceForKey,
  resolveWorkflowDrillKey,
  type AvailableDrillDisplayOption,
  type AvailableDrillOption
} from "./available-drill-selection.ts";
import type { AvailableDrillOption } from "./available-drill-selection.ts";

type DrillRepositoryContext = {
  mode: "local" | "cloud";
  session?: unknown;
};

type AvailableDrillDependencies = {
  listDrills: (context: DrillRepositoryContext) => Promise<Array<{
    drillId: string;
    activeReadyVersion: { sourceId: string; packageJson: DrillPackage } | null;
  }>>;
  listExchange: (input: { session: unknown }) => Promise<{ ok: true; value: ExchangePublication[] } | { ok: false; error: string }>;
};

type ExchangePublication = {
  id: string;
  snapshotPackage: {
    manifest: { packageVersion: string };
    drills: PortableDrill[];
  };
};

const DEFAULT_AVAILABLE_DRILL_DEPENDENCIES: AvailableDrillDependencies = {
  listDrills: async (context) => {
    const library = await import("../library/drill-repository.ts");
    return library.listDrillsWithActiveVersion(context as Parameters<typeof library.listDrillsWithActiveVersion>[0]);
  },
  listExchange: async (input) => {
    const exchange = await import("../exchange/index.ts");
    return exchange.listExchangePublications(input as Parameters<typeof exchange.listExchangePublications>[0]);
  }
};

export function mapExchangePublicationsToDrillOptions(publications: ExchangePublication[]): AvailableDrillOption[] {
  const options: AvailableDrillOption[] = [];
  for (const publication of publications) {
    const drill = publication.snapshotPackage.drills[0];
    if (!drill) {
      continue;
    }
    options.push({
      key: `exchange:${publication.id}:${drill.drillId}`,
      label: buildDrillOptionLabel(drill),
      sourceKind: "exchange",
      sourceId: publication.id,
      packageVersion: publication.snapshotPackage.manifest.packageVersion,
      benchmarkState: summarizeBenchmark(drill.benchmark).present ? "available" : "unavailable",
      drill
    });
  }
  return options;
}

export async function loadAvailableDrillOptions(input: {
  session: unknown | null;
  isConfigured: boolean;
}, dependencies: AvailableDrillDependencies = DEFAULT_AVAILABLE_DRILL_DEPENDENCIES): Promise<AvailableDrillOption[]> {
  const context: DrillRepositoryContext = input.session && input.isConfigured ? { mode: "cloud", session: input.session as DrillRepositoryContext["session"] } : { mode: "local" };
  const drills = await dependencies.listDrills(context);
  const options: AvailableDrillOption[] = [];
  for (const drill of drills) {
    const selectedVersion = drill.activeReadyVersion;
    if (!selectedVersion) {
      continue;
    }
    const selectedDrill = selectedVersion.packageJson.drills[0];
    if (!selectedDrill) {
      continue;
    }

    const sourceKind = context.mode === "cloud" ? "hosted" : "local";
    const sourceId = selectedVersion.sourceId;
    options.push({
      key: `${sourceKind}:${sourceId}:${drill.drillId}`,
      label: buildDrillOptionLabel(selectedDrill),
      sourceKind,
      sourceId,
      packageVersion: selectedVersion.packageJson.manifest.packageVersion,
      benchmarkState: summarizeBenchmark(selectedDrill.benchmark).present ? "available" : "unavailable",
      drill: selectedDrill
    });
  }

  const exchange = await dependencies.listExchange({ session: input.session as DrillRepositoryContext["session"] }).catch(() => ({ ok: false as const, error: "Unavailable" }));
  if (exchange.ok) {
    options.push(...mapExchangePublicationsToDrillOptions(exchange.value));
  }

  return options;
}
