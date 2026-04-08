import { getPrimaryDrill } from "@/lib/editor/package-editor";
import type { DrillPackage } from "@/lib/schema/contracts";

export type ReadinessIssue = {
  code: "missing-title" | "missing-drill-type" | "missing-phases" | "missing-pose-data";
  message: string;
};

export function validateVersionReadiness(pkg: DrillPackage): { isReady: boolean; issues: ReadinessIssue[] } {
  const drill = getPrimaryDrill(pkg);
  const issues: ReadinessIssue[] = [];

  if (!drill?.title?.trim()) {
    issues.push({ code: "missing-title", message: "Drill title is required." });
  }

  if (!drill?.drillType || (drill.drillType !== "rep" && drill.drillType !== "hold")) {
    issues.push({ code: "missing-drill-type", message: "Drill type must be rep or hold." });
  }

  if (!drill?.phases?.length) {
    issues.push({ code: "missing-phases", message: "At least one phase is required." });
  }

  if ((drill?.phases ?? []).some((phase) => !phase.poseSequence?.length || !phase.poseSequence[0]?.joints)) {
    issues.push({ code: "missing-pose-data", message: "Each phase needs canonical pose data." });
  }

  return { isReady: issues.length === 0, issues };
}
