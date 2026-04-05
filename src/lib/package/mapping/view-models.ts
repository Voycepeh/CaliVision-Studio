import type { DrillPackage, PortableDrill, PortablePhase } from "@/lib/schema/contracts";
import type { PackageValidationResult } from "@/lib/package/validation/validate-package";

export type StudioPackageListItem = {
  packageKey: string;
  packageId: string;
  packageVersion: string;
  sourceLabel: string;
  drillCount: number;
  phaseCount: number;
  isValid: boolean;
};

export type StudioPhaseViewModel = {
  phaseId: string;
  order: number;
  title: string;
  durationMs: number;
  startOffsetMs?: number;
  poseCount: number;
  assetCount: number;
  summary?: string;
};

export type StudioDrillViewModel = {
  drillId: string;
  title: string;
  slug: string;
  description?: string;
  difficulty: string;
  defaultView: string;
  tags: string[];
  phases: StudioPhaseViewModel[];
};

export type StudioPackageViewModel = {
  packageKey: string;
  package: DrillPackage;
  validation: PackageValidationResult;
  listItem: StudioPackageListItem;
  primaryDrill: StudioDrillViewModel | null;
};

export function mapPackageToStudioViewModel(
  packageKey: string,
  drillPackage: DrillPackage,
  validation: PackageValidationResult,
  sourceLabel: string
): StudioPackageViewModel {
  const primaryDrill = drillPackage.drills[0] ? mapDrillToViewModel(drillPackage.drills[0]) : null;
  const phaseCount = drillPackage.drills.reduce((count, drill) => count + drill.phases.length, 0);

  return {
    packageKey,
    package: drillPackage,
    validation,
    primaryDrill,
    listItem: {
      packageKey,
      packageId: drillPackage.manifest.packageId,
      packageVersion: drillPackage.manifest.packageVersion,
      sourceLabel,
      drillCount: drillPackage.drills.length,
      phaseCount,
      isValid: validation.isValid
    }
  };
}

export function mapDrillToViewModel(drill: PortableDrill): StudioDrillViewModel {
  return {
    drillId: drill.drillId,
    title: drill.title,
    slug: drill.slug,
    description: drill.description,
    difficulty: drill.difficulty,
    defaultView: drill.defaultView,
    tags: drill.tags,
    phases: [...drill.phases]
      .sort((a, b) => a.order - b.order)
      .map((phase) => mapPhaseToViewModel(phase))
  };
}

export function mapPhaseToViewModel(phase: PortablePhase): StudioPhaseViewModel {
  return {
    phaseId: phase.phaseId,
    order: phase.order,
    title: phase.title,
    durationMs: phase.durationMs,
    startOffsetMs: phase.startOffsetMs,
    poseCount: phase.poseSequence.length,
    assetCount: phase.assetRefs.length,
    summary: phase.summary
  };
}
