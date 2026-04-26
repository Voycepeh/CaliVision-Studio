import {
  buildDuplicateSafeDrillLabel,
  DRILL_SOURCE_ORDER,
  toDrillSourceKind,
  type DrillSourceKind
} from "../drill-source.ts";
import { resolveSelectedDrillKey } from "../upload/drill-selection.ts";
import type { PortableAssetRef, PortableDrill } from "../schema/contracts.ts";

export type AvailableDrillOption = {
  key: string;
  label: string;
  sourceKind: "local" | "hosted" | "exchange";
  sourceId?: string;
  packageVersion?: string;
  benchmarkState?: "available" | "unavailable" | "legacy-missing";
  drill: PortableDrill;
  assets?: PortableAssetRef[];
};

export type AvailableDrillDisplayOption = AvailableDrillOption & { displayLabel: string };

export function buildDrillOptionGroups(options: AvailableDrillOption[]): Map<DrillSourceKind, AvailableDrillDisplayOption[]> {
  const titleCounts = new Map<string, number>();
  for (const option of options) {
    const key = `${toDrillSourceKind(option.sourceKind)}::${option.drill.title.trim().toLowerCase()}`;
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }

  const grouped = new Map<DrillSourceKind, AvailableDrillDisplayOption[]>();
  for (const source of DRILL_SOURCE_ORDER) {
    grouped.set(source, []);
  }

  for (const option of options) {
    const source = toDrillSourceKind(option.sourceKind);
    const duplicateTitleCount = titleCounts.get(`${source}::${option.drill.title.trim().toLowerCase()}`) ?? 1;
    grouped.get(source)?.push({
      ...option,
      displayLabel: buildDuplicateSafeDrillLabel({
        baseLabel: option.label,
        sourceKind: option.sourceKind,
        sourceId: option.sourceId,
        drillId: option.drill.drillId,
        duplicateTitleCount
      })
    });
  }

  return grouped;
}

export function resolveWorkflowDrillKey(input: {
  options: AvailableDrillOption[];
  requestedDrillKey?: string | null;
  currentKey?: string | null;
  storageKey: string;
  fallbackKey: string;
}): string {
  const stored = typeof window !== "undefined" ? window.localStorage.getItem(input.storageKey) : null;
  const resolved = resolveSelectedDrillKey(input.options, input.requestedDrillKey ?? input.currentKey, stored);
  return resolved ?? input.fallbackKey;
}

export function ensureVisibleDrillSelection(input: {
  selectedKey: string;
  selectedSource: DrillSourceKind;
  groupedOptions: Map<DrillSourceKind, AvailableDrillDisplayOption[]>;
  fallbackKey: string;
}): string {
  if (input.selectedKey === input.fallbackKey) {
    return input.selectedKey;
  }
  const visibleOptions = input.groupedOptions.get(input.selectedSource) ?? [];
  if (visibleOptions.some((option) => option.key === input.selectedKey)) {
    return input.selectedKey;
  }
  return visibleOptions[0]?.key ?? input.fallbackKey;
}

export function resolveSelectedSourceForKey(input: {
  options: AvailableDrillOption[];
  selectedKey: string;
  fallbackKey: string;
  defaultSource: DrillSourceKind;
}): DrillSourceKind {
  if (!input.selectedKey || input.selectedKey === input.fallbackKey) {
    return input.defaultSource;
  }
  const matching = input.options.find((option) => option.key === input.selectedKey);
  if (!matching) {
    return input.defaultSource;
  }
  return toDrillSourceKind(matching.sourceKind);
}

export function persistSelectedDrillKey(storageKey: string, selectedKey: string): void {
  if (typeof window === "undefined" || !selectedKey) {
    return;
  }
  window.localStorage.setItem(storageKey, selectedKey);
}
