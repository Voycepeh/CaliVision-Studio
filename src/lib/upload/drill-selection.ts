import type { PortableDrill } from "@/lib/schema/contracts";
import type { DrillCameraView } from "../analysis/camera-view.ts";

export function resolveSelectedDrillKey(options: Array<{ key: string }>, currentKey?: string | null, storedKey?: string | null): string | null {
  const preferred = currentKey ?? storedKey ?? options[0]?.key ?? null;
  if (!preferred) {
    return null;
  }
  return options.some((option) => option.key === preferred) ? preferred : options[0]?.key ?? null;
}

export function createUploadJobDrillSelection(input: {
  cameraView: DrillCameraView;
  selectedDrill?: {
    key: string;
    sourceKind: "local" | "hosted";
    sourceId?: string;
    packageVersion?: string;
    drill: PortableDrill;
  } | null;
}) {
  if (!input.selectedDrill) {
    return {
      mode: "freestyle" as const,
      cameraView: input.cameraView,
      drillVersion: undefined,
      drillBinding: {
        drillName: "No drill (Freestyle overlay)",
        sourceKind: "freestyle" as const,
        sourceLabel: "freestyle:overlay-only"
      }
    };
  }

  const drill = input.selectedDrill.drill;
  const drillVersion = input.selectedDrill.packageVersion;
  return {
    mode: "drill" as const,
    drill,
    drillVersion,
    cameraView: input.cameraView,
    drillBinding: {
      drillId: drill.drillId,
      drillName: drill.title,
      drillVersion,
      sourceKind: input.selectedDrill.sourceKind,
      sourceId: input.selectedDrill.sourceId,
      sourceLabel: input.selectedDrill.key
    }
  };
}
