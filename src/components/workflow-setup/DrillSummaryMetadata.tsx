import { formatStoredDrillSourceLabel, type StoredDrillSourceKind } from "@/lib/drill-source";
import type { PortableDrill } from "@/lib/schema/contracts";

type DrillSummaryMetadataProps = {
  drill: PortableDrill | null;
  sourceKind?: StoredDrillSourceKind;
  freestyleDescription: string;
};

function formatDrillTypeLabel(drillType: PortableDrill["drillType"]): string {
  return drillType === "rep" ? "Rep" : "Hold";
}

function formatViewLabel(view: PortableDrill["primaryView"]): string {
  if (view === "front") return "Front";
  if (view === "rear") return "Rear";
  return "Side";
}

export function DrillSummaryMetadata({ drill, sourceKind, freestyleDescription }: DrillSummaryMetadataProps) {
  if (!drill) {
    return (
      <section className="card" style={{ margin: 0, background: "rgba(114,168,255,0.04)" }}>
        <strong style={{ fontSize: "0.9rem" }}>Freestyle overlay mode</strong>
        <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.82rem" }}>{freestyleDescription}</p>
      </section>
    );
  }

  return (
    <section className="card" style={{ margin: 0, display: "grid", gap: "0.5rem", background: "rgba(114,168,255,0.04)" }}>
      <strong style={{ fontSize: "0.9rem" }}>{drill.title}</strong>
      <div className="muted" style={{ fontSize: "0.82rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        <span>Type: {formatDrillTypeLabel(drill.drillType)}</span>
        <span>View: {formatViewLabel(drill.primaryView)}</span>
        <span>Phases: {drill.phases.length}</span>
        {sourceKind ? <span>Source: {formatStoredDrillSourceLabel(sourceKind)}</span> : null}
      </div>
    </section>
  );
}
