import type { PortableDrill, PortableViewType } from "@/lib/schema/contracts";

function formatDrillTypeLabel(drillType: PortableDrill["drillType"]): string {
  return drillType === "rep" ? "Rep" : "Hold";
}

function formatViewLabel(view: PortableViewType): string {
  if (view === "front") return "Front";
  if (view === "rear") return "Rear";
  return "Side";
}

export function buildDrillOptionLabel(drill: PortableDrill): string {
  return `${drill.title} · ${formatDrillTypeLabel(drill.drillType)} · ${formatViewLabel(drill.primaryView)}`;
}
