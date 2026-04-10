import { DrillSelectionPreviewPanel } from "@/components/upload/DrillSelectionPreviewPanel";
import type { StoredDrillSourceKind } from "@/lib/drill-source";
import type { PortableDrill } from "@/lib/schema/contracts";
import { DrillSummaryMetadata } from "@/components/workflow-setup/DrillSummaryMetadata";

type ReferenceAnimationPanelProps = {
  drill: PortableDrill | null;
  sourceKind?: StoredDrillSourceKind;
  freestyleDescription: string;
};

export function ReferenceAnimationPanel({ drill, sourceKind, freestyleDescription }: ReferenceAnimationPanelProps) {
  return (
    <section style={{ display: "grid", gap: "0.65rem" }}>
      <DrillSummaryMetadata drill={drill} sourceKind={sourceKind} freestyleDescription={freestyleDescription} />
      {drill ? <DrillSelectionPreviewPanel drill={drill} sourceKind={sourceKind} showSourceBadge compact quiet /> : null}
    </section>
  );
}
