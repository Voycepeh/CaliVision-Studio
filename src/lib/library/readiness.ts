import { getPrimaryDrill } from "@/lib/editor/package-editor";
import type { DrillPackage } from "@/lib/schema/contracts";

export type ReadinessIssue = {
  code: "missing-title" | "missing-drill-type" | "missing-camera-view" | "missing-phases" | "missing-phase-content";
  message: string;
};

type DraftSetupFlags = {
  movementTypeConfigured?: boolean;
  cameraViewConfigured?: boolean;
};

function readDraftSetupFlags(pkg: DrillPackage): DraftSetupFlags {
  const drill = getPrimaryDrill(pkg) as (ReturnType<typeof getPrimaryDrill> & { draftSetup?: DraftSetupFlags }) | null;
  return drill?.draftSetup ?? {};
}

export function validateVersionReadiness(pkg: DrillPackage): { isReady: boolean; issues: ReadinessIssue[] } {
  const drill = getPrimaryDrill(pkg);
  const draftSetup = readDraftSetupFlags(pkg);
  const issues: ReadinessIssue[] = [];

  if (!drill?.title?.trim()) {
    issues.push({ code: "missing-title", message: "Drill title is required." });
  }

  if (!draftSetup.movementTypeConfigured || !drill?.drillType || (drill.drillType !== "rep" && drill.drillType !== "hold")) {
    issues.push({ code: "missing-drill-type", message: "Choose a movement type." });
  }

  if (!draftSetup.cameraViewConfigured || !drill?.primaryView || !["front", "side", "rear"].includes(drill.primaryView)) {
    issues.push({ code: "missing-camera-view", message: "Choose a camera view." });
  }

  if (!drill?.phases?.length) {
    issues.push({ code: "missing-phases", message: "At least one phase is required." });
  }

  if ((drill?.phases ?? []).some((phase) => !phase.name.trim() || !phase.poseSequence?.length || !Object.keys(phase.poseSequence[0]?.joints ?? {}).length)) {
    issues.push({ code: "missing-phase-content", message: "Each phase must include a name and authored pose data." });
  }

  return { isReady: issues.length === 0, issues };
}
