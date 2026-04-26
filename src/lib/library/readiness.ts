import { getPrimaryDrill } from "@/lib/editor/package-editor";
import type { DrillPackage, PortablePhase } from "@/lib/schema/contracts";

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

function resolvePhaseLabel(phase: PortablePhase, index: number): string {
  const name = phase.name.trim();
  if (name.length > 0) {
    return name;
  }
  return `Phase ${index + 1}`;
}

function isMeaningfulPhaseName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === "phase" || normalized === "new phase") {
    return false;
  }
  if (/^phase\s*\d+$/.test(normalized)) {
    return false;
  }
  return true;
}

function hasPoseReference(phase: PortablePhase): boolean {
  if (!phase.poseSequence?.length) {
    return false;
  }
  return phase.poseSequence.some((pose) => Object.keys(pose.joints ?? {}).length > 0);
}

export function validateVersionReadiness(pkg: DrillPackage): { isReady: boolean; issues: ReadinessIssue[] } {
  const drill = getPrimaryDrill(pkg);
  const draftSetup = readDraftSetupFlags(pkg);
  const issues: ReadinessIssue[] = [];

  if (!drill?.title?.trim()) {
    issues.push({ code: "missing-title", message: "Add a drill title before marking this draft ready." });
  }

  if (!draftSetup.movementTypeConfigured || !drill?.drillType || (drill.drillType !== "rep" && drill.drillType !== "hold")) {
    issues.push({ code: "missing-drill-type", message: "Choose whether this is a hold or rep drill." });
  }

  if (!draftSetup.cameraViewConfigured || !drill?.primaryView || !["front", "side", "rear"].includes(drill.primaryView)) {
    issues.push({ code: "missing-camera-view", message: "Choose the camera view users should record from." });
  }

  if (!drill?.phases?.length) {
    issues.push({ code: "missing-phases", message: "Add at least one phase." });
  }

  (drill?.phases ?? []).forEach((phase, index) => {
    const phaseLabel = resolvePhaseLabel(phase, index);

    if (!hasPoseReference(phase)) {
      issues.push({ code: "missing-phase-content", message: `Add a pose reference for ${phaseLabel}.` });
    }

    if (!isMeaningfulPhaseName(phase.name)) {
      issues.push({
        code: "missing-phase-content",
        message: `Name ${phaseLabel} so Upload Video and Live can show clear coaching labels.`
      });
    }
  });

  if (drill?.drillType === "hold" && (drill.phases?.length ?? 0) > 1) {
    issues.push({
      code: "missing-phase-content",
      message: "Hold drills work best as one sustained phase. Keep one primary phase for clearer coaching."
    });
  }

  if (drill?.drillType === "rep" && (drill.phases?.length ?? 0) < 2) {
    issues.push({
      code: "missing-phase-content",
      message: "Rep drills should include a full phase sequence. Add at least two phases."
    });
  }

  return { isReady: issues.length === 0, issues };
}
