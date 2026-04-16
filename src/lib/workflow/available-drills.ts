import { listDrillsWithActiveVersion, type DrillRepositoryContext } from "../library/index.ts";
import { buildDrillOptionLabel } from "../drills/labels.ts";
export {
  buildDrillOptionGroups,
  ensureVisibleDrillSelection,
  persistSelectedDrillKey,
  resolveSelectedSourceForKey,
  resolveWorkflowDrillKey,
  type AvailableDrillDisplayOption,
  type AvailableDrillOption
} from "./available-drill-selection";
import type { AvailableDrillOption } from "./available-drill-selection";

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
  return options;
}
