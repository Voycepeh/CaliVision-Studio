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
  drillId?: string;
  duplicateTitleCount: number;
}): string {
  if (input.duplicateTitleCount <= 1) {
    return input.baseLabel;
  }

  const sourceLabel = formatStoredDrillSourceLabel(input.sourceKind);
  const stableSeed = `${input.sourceId ?? ""}:${input.drillId ?? ""}`;
  const shortDisambiguator = shortStableDisambiguator(stableSeed);
  return `${input.baseLabel} — ${sourceLabel} ${shortDisambiguator}`;
}

function shortStableDisambiguator(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36).slice(0, 4).padStart(4, "0");
}
