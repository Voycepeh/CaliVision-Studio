import { getPrimaryDrill } from "@/lib/editor/package-editor";
import { createPublishArtifact } from "@/lib/publishing/artifact";
import type { DrillPackage } from "@/lib/schema/contracts";

export type PublishReadinessIssueCode =
  | "missing-package-id"
  | "missing-package-version"
  | "missing-drill"
  | "missing-title"
  | "missing-summary"
  | "missing-phases"
  | "missing-phase-pose"
  | "missing-phase-summary"
  | "phase-missing-assets"
  | "artifact-generation";

export type PublishReadinessIssue = {
  severity: "error" | "warning";
  code: PublishReadinessIssueCode;
  path: string;
  message: string;
};

export type PublishReadinessResult = {
  isReady: boolean;
  errors: PublishReadinessIssue[];
  warnings: PublishReadinessIssue[];
  issues: PublishReadinessIssue[];
};

function toResult(issues: PublishReadinessIssue[]): PublishReadinessResult {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    isReady: errors.length === 0,
    errors,
    warnings,
    issues
  };
}

export async function validatePackagePublishReadiness(drillPackage: DrillPackage): Promise<PublishReadinessResult> {
  const issues: PublishReadinessIssue[] = [];

  if (!drillPackage.manifest.packageId.trim()) {
    issues.push({
      severity: "error",
      code: "missing-package-id",
      path: "manifest.packageId",
      message: "Package ID is required before publishing."
    });
  }

  if (!drillPackage.manifest.packageVersion.trim()) {
    issues.push({
      severity: "error",
      code: "missing-package-version",
      path: "manifest.packageVersion",
      message: "Package version is required before publishing."
    });
  }

  const drill = getPrimaryDrill(drillPackage);
  if (!drill) {
    issues.push({
      severity: "error",
      code: "missing-drill",
      path: "drills",
      message: "At least one drill is required for publishing."
    });
    return toResult(issues);
  }

  const publishTitle = drillPackage.manifest.publishing?.title ?? drill.title;
  if (!publishTitle.trim()) {
    issues.push({
      severity: "error",
      code: "missing-title",
      path: "manifest.publishing.title",
      message: "Publish title is required."
    });
  }

  const publishSummary = drillPackage.manifest.publishing?.summary ?? drill.description ?? "";
  if (!publishSummary.trim()) {
    issues.push({
      severity: "error",
      code: "missing-summary",
      path: "manifest.publishing.summary",
      message: "Publish summary is required so packages can be listed clearly."
    });
  }

  if (drill.phases.length === 0) {
    issues.push({
      severity: "error",
      code: "missing-phases",
      path: "drills[0].phases",
      message: "At least one phase is required before publishing."
    });
  }

  drill.phases.forEach((phase, phaseIndex) => {
    if (phase.poseSequence.length === 0) {
      issues.push({
        severity: "warning",
        code: "missing-phase-pose",
        path: `drills[0].phases[${phaseIndex}].poseSequence`,
        message: `Phase '${phase.title}' has no pose sequence yet.`
      });
    }

    if (!phase.summary?.trim()) {
      issues.push({
        severity: "warning",
        code: "missing-phase-summary",
        path: `drills[0].phases[${phaseIndex}].summary`,
        message: `Phase '${phase.title}' is missing a summary.`
      });
    }

    if (phase.assetRefs.length === 0) {
      issues.push({
        severity: "warning",
        code: "phase-missing-assets",
        path: `drills[0].phases[${phaseIndex}].assetRefs`,
        message: `Phase '${phase.title}' has no source assets attached.`
      });
    }
  });

  try {
    await createPublishArtifact(drillPackage);
  } catch (error) {
    issues.push({
      severity: "error",
      code: "artifact-generation",
      path: "publishing.artifact",
      message: error instanceof Error ? error.message : "Artifact generation failed unexpectedly."
    });
  }

  return toResult(issues);
}
