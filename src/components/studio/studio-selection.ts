import type { EditablePackageEntry } from "@/lib/editor/package-editor";

export type PreviousPhaseIndexMap = Record<string, Record<string, number>>;

export function buildPhaseIndexMap(packages: EditablePackageEntry[]): PreviousPhaseIndexMap {
  return Object.fromEntries(
    packages.map((entry) => [
      entry.packageKey,
      Object.fromEntries(entry.workingPackage.drills.flatMap((drill) => drill.phases.map((phase, index) => [phase.phaseId, index])))
    ])
  );
}

export function chooseFallbackPhaseId(input: {
  selectedPhaseId: string | null;
  availablePhaseIds: string[];
  previousPhaseIndexes: Record<string, number>;
}): string | null {
  const { selectedPhaseId, availablePhaseIds, previousPhaseIndexes } = input;

  if (availablePhaseIds.length === 0) {
    return null;
  }

  if (selectedPhaseId && availablePhaseIds.includes(selectedPhaseId)) {
    return selectedPhaseId;
  }

  if (selectedPhaseId) {
    const previousIndex = previousPhaseIndexes[selectedPhaseId];
    if (typeof previousIndex === "number") {
      const nearestIndex = Math.min(previousIndex, availablePhaseIds.length - 1);
      return availablePhaseIds[Math.max(0, nearestIndex)] ?? availablePhaseIds[0] ?? null;
    }
  }

  return availablePhaseIds[0] ?? null;
}
