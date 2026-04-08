import type { PortableDrill } from "@/lib/schema/contracts";

export function resolveSelectedDrillKey(options: Array<{ key: string }>, currentKey?: string | null, storedKey?: string | null): string | null {
  const preferred = currentKey ?? storedKey ?? options[0]?.key ?? null;
  if (!preferred) {
    return null;
  }
  return options.some((option) => option.key === preferred) ? preferred : options[0]?.key ?? null;
}

export function createUploadJobDrillSelection(input: {
  fallbackDrill: PortableDrill;
  selectedDrill?: {
    key: string;
    sourceKind: "seeded" | "local" | "hosted";
    sourceId?: string;
    packageVersion?: string;
    drill: PortableDrill;
  } | null;
}) {
  const drill = input.selectedDrill?.drill ?? input.fallbackDrill;
  const drillVersion = input.selectedDrill?.packageVersion ?? "sample-v1";
  return {
    drill,
    drillVersion,
    drillBinding: {
      drillId: drill.drillId,
      drillName: drill.title,
      drillVersion,
      sourceKind: input.selectedDrill?.sourceKind ?? "seeded",
      sourceId: input.selectedDrill?.sourceId,
      sourceLabel: input.selectedDrill?.key ?? "seeded:default"
    }
  };
}
