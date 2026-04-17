import type { PortableDrill } from "@/lib/schema/contracts";
import { resolveDrillCameraViewWithDiagnostics } from "../analysis/camera-view.ts";

export function resolveSelectedDrillKey(options: Array<{ key: string }>, currentKey?: string | null, storedKey?: string | null): string | null {
  const preferred = currentKey ?? storedKey ?? options[0]?.key ?? null;
  if (!preferred) {
    return null;
  }
  return options.some((option) => option.key === preferred) ? preferred : options[0]?.key ?? null;
}

export function createUploadJobDrillSelection(input: {
  selectedDrill?: {
    key: string;
    sourceKind: "local" | "hosted" | "exchange";
    sourceId?: string;
    packageVersion?: string;
    drill: PortableDrill;
  } | null;
}) {
  if (!input.selectedDrill) {
    return {
      mode: "freestyle" as const,
      drillVersion: undefined,
      drillBinding: {
        drillName: "No drill (Freestyle overlay)",
        sourceKind: "freestyle" as const,
        sourceLabel: "freestyle:overlay-only"
      }
    };
  }

  const drill = input.selectedDrill.drill;
  const resolvedCameraView = resolveDrillCameraViewWithDiagnostics(drill);
  if (resolvedCameraView.diagnostics.warning && process.env.NODE_ENV !== "production") {
    console.warn("[upload-analysis] DRILL_CAMERA_VIEW_FALLBACK", {
      warning: resolvedCameraView.diagnostics.warning,
      drillId: drill.drillId,
      drillTitle: drill.title
    });
  }
  const drillVersion = input.selectedDrill.packageVersion;
  return {
    mode: "drill" as const,
    drill,
    drillVersion,
    cameraView: resolvedCameraView.cameraView,
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
