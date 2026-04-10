import type { PortableDrill } from "@/lib/schema/contracts";

export type ResolvedDrillCameraView = "front" | "side";

export type DrillCameraViewResolution = {
  cameraView: ResolvedDrillCameraView;
  source: "primaryView" | "defaultView" | "fallback";
  warning?: string;
};

export function normalizeDrillCameraView(value: unknown): ResolvedDrillCameraView | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "front") {
    return "front";
  }
  if (normalized === "side") {
    return "side";
  }
  if (normalized === "rear") {
    return "front";
  }
  return null;
}

export function resolveDrillCameraView(drill: PortableDrill | null | undefined): DrillCameraViewResolution {
  const primary = normalizeDrillCameraView((drill as { primaryView?: unknown } | null | undefined)?.primaryView);
  if (primary) {
    return { cameraView: primary, source: "primaryView" };
  }

  const legacyDefault = normalizeDrillCameraView((drill as { defaultView?: unknown } | null | undefined)?.defaultView);
  if (legacyDefault) {
    return {
      cameraView: legacyDefault,
      source: "defaultView",
      warning: `Drill ${drill?.drillId ?? "unknown"} is missing primaryView. Falling back to legacy defaultView.`
    };
  }

  return {
    cameraView: "front",
    source: "fallback",
    warning: drill
      ? `Drill ${drill.drillId} has invalid/missing camera view. Falling back to front.`
      : "No drill selected. Falling back to front camera view."
  };
}

export function formatCameraViewLabel(view: ResolvedDrillCameraView): "Front" | "Side" {
  return view === "side" ? "Side" : "Front";
}
