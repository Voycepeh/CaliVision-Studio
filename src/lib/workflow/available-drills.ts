import { listDrillsWithActiveVersion, type DrillRepositoryContext } from "../library/index.ts";
import { buildDrillOptionLabel } from "../drills/labels.ts";
import { listExchangePublications, type ExchangePublication } from "../exchange/index.ts";
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
      drill
    });
  }
  return options;
}

export async function loadAvailableDrillOptions(input: {
  session: unknown | null;
  isConfigured: boolean;
}): Promise<AvailableDrillOption[]> {
  const context: DrillRepositoryContext = input.session && input.isConfigured ? { mode: "cloud", session: input.session as DrillRepositoryContext["session"] } : { mode: "local" };
  const drills = await listDrillsWithActiveVersion(context);
  const options: AvailableDrillOption[] = [];
  for (const drill of drills) {
    const selectedVersion = drill.activeReadyVersion ?? drill.openDraftVersion ?? drill.currentVersion;
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
      drill: selectedDrill
    });
  }

  const exchange = await listExchangePublications({ session: input.session as DrillRepositoryContext["session"] }).catch(() => ({ ok: false as const, error: "Unavailable" }));
  if (exchange.ok) {
    options.push(...mapExchangePublicationsToDrillOptions(exchange.value));
  }

  return options;
}
