import { clampNormalized } from "@/lib/canvas/mapping";
import { normalizePortableDrillPackage, validatePortableDrillPackage, type PackageValidationResult } from "@/lib/package/validation/validate-package";
import { createDefaultPortablePose } from "@/lib/pose/portable-pose";
import type { CanonicalJointName, DrillPackage, PortablePhase, PortablePose, PortableViewType } from "@/lib/schema/contracts";

export type EditablePackageEntry = {
  packageKey: string;
  sourceLabel: string;
  sourcePackage: DrillPackage;
  workingPackage: DrillPackage;
  validation: PackageValidationResult;
  isDirty: boolean;
};

export function clonePackage(drillPackage: DrillPackage): DrillPackage {
  if (typeof structuredClone === "function") {
    return structuredClone(drillPackage);
  }

  return JSON.parse(JSON.stringify(drillPackage)) as DrillPackage;
}

export function createEditablePackageEntry(packageKey: string, sourceLabel: string, sourcePackage: DrillPackage): EditablePackageEntry {
  const normalized = normalizePortableDrillPackage(sourcePackage);
  const baseline = clonePackage(normalized);
  const workingPackage = clonePackage(normalized);

  return {
    packageKey,
    sourceLabel,
    sourcePackage: baseline,
    workingPackage,
    validation: validatePortableDrillPackage(workingPackage),
    isDirty: false
  };
}

export function updateWorkingPackage(entry: EditablePackageEntry, mutator: (draft: DrillPackage) => void): EditablePackageEntry {
  const workingPackage = clonePackage(entry.workingPackage);
  mutator(workingPackage);

  const validation = validatePortableDrillPackage(workingPackage);

  return {
    ...entry,
    workingPackage,
    validation,
    isDirty: JSON.stringify(workingPackage) !== JSON.stringify(entry.sourcePackage)
  };
}

export function getPrimaryDrill(drillPackage: DrillPackage) {
  return drillPackage.drills[0] ?? null;
}

export function getSortedPhases(drillPackage: DrillPackage): PortablePhase[] {
  const drill = getPrimaryDrill(drillPackage);
  if (!drill) {
    return [];
  }

  return [...drill.phases].sort((a, b) => a.order - b.order);
}

export function normalizePhaseOrder(drillPackage: DrillPackage): void {
  const drill = getPrimaryDrill(drillPackage);
  if (!drill) {
    return;
  }

  drill.phases = [...drill.phases]
    .sort((a, b) => a.order - b.order)
    .map((phase, index) => ({ ...phase, order: index + 1 }));
}

export function ensureUniquePhaseId(phases: PortablePhase[], seed: string): string {
  const existing = new Set(phases.map((phase) => phase.phaseId));
  if (!existing.has(seed)) {
    return seed;
  }

  let index = 2;
  while (existing.has(`${seed}_${index}`)) {
    index += 1;
  }

  return `${seed}_${index}`;
}

export function createStablePhaseId(phases: PortablePhase[]): string {
  return ensureUniquePhaseId(
    phases,
    `phase_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  );
}

export function createDefaultPose(poseId: string, view: PortableViewType, timestampMs = 0): PortablePose {
  return createDefaultPortablePose(poseId, view, timestampMs);
}

export function createNewPhase(phaseId: string, order: number, view: PortableViewType): PortablePhase {
  return {
    phaseId,
    order,
    title: `Phase ${order}`,
    summary: "",
    durationMs: 5000,
    poseSequence: [createDefaultPose(`${phaseId}_pose_001`, view, 0)],
    assetRefs: []
  };
}

export function ensurePhaseHasPose(phase: PortablePhase, preferredView: PortableViewType): PortablePose {
  if (phase.poseSequence[0]) {
    return phase.poseSequence[0];
  }

  const pose = createDefaultPose(`${phase.phaseId}_pose_001`, preferredView, phase.startOffsetMs ?? 0);
  phase.poseSequence = [pose];
  return pose;
}

export function setJointCoordinate(
  phase: PortablePhase,
  joint: CanonicalJointName,
  coordinate: { x: number; y: number },
  preferredView: PortableViewType
): void {
  const pose = ensurePhaseHasPose(phase, preferredView);
  pose.joints[joint] = {
    ...(pose.joints[joint] ?? { confidence: 1 }),
    x: clampNormalized(coordinate.x),
    y: clampNormalized(coordinate.y)
  };
}
