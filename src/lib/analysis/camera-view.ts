import type { PortableDrill } from "../schema/contracts.ts";

export type DrillCameraView = "front" | "side";

type CameraViewDiagnostics = {
  usedFallback: boolean;
  warning?: string;
};

const FRONT_ALIASES = new Set(["front", "facing_front", "frontal"]);
const SIDE_ALIASES = new Set(["side", "profile", "lateral", "rear"]);

export function resolveDrillCameraView(drill?: Pick<PortableDrill, "primaryView" | "defaultView" | "drillId" | "title"> | null): DrillCameraView {
  return resolveDrillCameraViewWithDiagnostics(drill).cameraView;
}

export function resolveDrillCameraViewWithDiagnostics(
  drill?: Pick<PortableDrill, "primaryView" | "defaultView" | "drillId" | "title"> | null
): { cameraView: DrillCameraView; diagnostics: CameraViewDiagnostics } {
  const raw = typeof drill?.primaryView === "string" && drill.primaryView.trim().length > 0
    ? drill.primaryView
    : drill?.defaultView;

  const normalized = normalizeCameraView(raw);
  if (normalized) {
    return {
      cameraView: normalized,
      diagnostics: { usedFallback: false }
    };
  }

  const drillLabel = [drill?.title, drill?.drillId].filter(Boolean).join(" · ") || "unknown drill";
  return {
    cameraView: "front",
    diagnostics: {
      usedFallback: true,
      warning: `Invalid or missing drill camera view for ${drillLabel}; defaulting to front.`
    }
  };
}

export function normalizeCameraView(view: unknown): DrillCameraView | null {
  if (typeof view !== "string") {
    return null;
  }
  const value = view.trim().toLowerCase();
  if (FRONT_ALIASES.has(value)) {
    return "front";
  }
  if (SIDE_ALIASES.has(value)) {
    return "side";
  }
  return null;
}

export function formatCameraViewLabel(view: DrillCameraView): "Front" | "Side" {
  return view === "side" ? "Side" : "Front";
}

