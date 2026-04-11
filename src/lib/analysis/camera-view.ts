export type DrillCameraView = "front" | "side";

const FRONT_ALIASES = new Set(["front", "facing_front", "frontal"]);
const SIDE_ALIASES = new Set(["side", "profile", "lateral", "rear"]);

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
