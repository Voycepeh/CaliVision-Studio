import { listHostedLibrary } from "../hosted/library-repository.ts";
import { loadDraft, loadDraftList } from "../persistence/local-draft-store.ts";
import { buildDrillOptionLabel } from "../drills/labels.ts";
export {
  buildDrillOptionGroups,
  ensureVisibleDrillSelection,
  persistSelectedDrillKey,
  resolveWorkflowDrillKey,
  type AvailableDrillDisplayOption,
  type AvailableDrillOption
} from "./available-drill-selection";
import type { AvailableDrillOption } from "./available-drill-selection";

export async function loadAvailableDrillOptions(input: {
  session: unknown | null;
  isConfigured: boolean;
  localLimit?: number;
}): Promise<AvailableDrillOption[]> {
  const options: AvailableDrillOption[] = [];

  try {
    const localSummaries = await loadDraftList();
    for (const summary of localSummaries.slice(0, input.localLimit ?? 20)) {
      const loaded = await loadDraft(summary.draftId);
      const drill = loaded?.record.packageJson.drills[0];
      if (!drill) continue;
      options.push({
        key: `local:${summary.draftId}:${drill.drillId}`,
        label: buildDrillOptionLabel(drill),
        sourceKind: "local",
        sourceId: summary.draftId,
        packageVersion: loaded.record.packageJson.manifest.packageVersion,
        drill
      });
    }
  } catch {
    // local list is optional in non-browser contexts
  }

  if (input.session && input.isConfigured) {
    const hostedResult = await listHostedLibrary(input.session as Parameters<typeof listHostedLibrary>[0]);
    if (hostedResult.ok) {
      for (const item of hostedResult.value) {
        const drill = item.content.drills[0];
        if (!drill) continue;
        options.push({
          key: `hosted:${item.id}:${drill.drillId}`,
          label: buildDrillOptionLabel(drill),
          sourceKind: "hosted",
          sourceId: item.id,
          packageVersion: item.packageVersion,
          drill
        });
      }
    }
  }

  return options;
}
