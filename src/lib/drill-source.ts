export type StoredDrillSourceKind = "local" | "hosted" | "exchange";
export type DrillSourceKind = "local" | "cloud" | "exchange";

export const DRILL_SOURCE_ORDER: DrillSourceKind[] = ["local", "cloud", "exchange"];

export function toDrillSourceKind(sourceKind: StoredDrillSourceKind): DrillSourceKind {
  if (sourceKind === "hosted") {
    return "cloud";
  }
  return sourceKind;
}

export function formatDrillSourceLabel(sourceKind: DrillSourceKind): string {
  if (sourceKind === "cloud") return "Cloud";
  if (sourceKind === "exchange") return "Public";
  return "Local";
}

export function formatStoredDrillSourceLabel(sourceKind: StoredDrillSourceKind): string {
  return formatDrillSourceLabel(toDrillSourceKind(sourceKind));
}

export function buildDuplicateSafeDrillLabel(input: {
  baseLabel: string;
  sourceKind: StoredDrillSourceKind;
  sourceId?: string;
  duplicateTitleCount: number;
}): string {
  if (input.duplicateTitleCount <= 1) {
    return input.baseLabel;
  }

  const sourceLabel = formatStoredDrillSourceLabel(input.sourceKind);
  return `${input.baseLabel} — ${sourceLabel}`;
}
