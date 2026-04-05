"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import {
  clonePackage,
  createEditablePackageEntry,
  createNewPhase,
  ensureUniquePhaseId,
  getPrimaryDrill,
  getSortedPhases,
  normalizePhaseOrder,
  setJointCoordinate,
  updateWorkingPackage,
  type EditablePackageEntry
} from "@/lib/editor/package-editor";
import {
  downloadPackageJson,
  loadPackageFromUnknown,
  packageKeyFromFile,
  readPackageFile,
  SAMPLE_PACKAGE_DEFINITIONS,
  validatePortableDrillPackage,
  type PackageValidationIssue
} from "@/lib/package";
import type { CanonicalJointName, PortablePhase, PortableViewType, SchemaVersion } from "@/lib/schema/contracts";

export type ImportFeedback = {
  status: "idle" | "success" | "error";
  message: string;
  issues: PackageValidationIssue[];
};

type StudioStateValue = {
  packages: EditablePackageEntry[];
  selectedPackageKey: string | null;
  selectedPhaseId: string | null;
  selectedJointName: CanonicalJointName | null;
  importFeedback: ImportFeedback;
  saveStatusLabel: string;
  selectedPackage: EditablePackageEntry | null;
  selectPackage: (packageKey: string) => void;
  selectPhase: (phaseId: string | null) => void;
  selectJoint: (jointName: CanonicalJointName | null) => void;
  loadSampleById: (sampleId: string) => void;
  importFromFile: (file: File) => Promise<void>;
  exportSelectedPackage: () => void;
  renamePhase: (phaseId: string, title: string) => void;
  setPhaseDuration: (phaseId: string, durationMs: number) => void;
  setPhaseSummary: (phaseId: string, summary: string) => void;
  setPhaseView: (phaseId: string, view: PortableViewType) => void;
  addPhase: () => void;
  deletePhase: (phaseId: string) => void;
  duplicatePhase: (phaseId: string) => void;
  movePhase: (phaseId: string, direction: "up" | "down") => void;
  setJointCoordinates: (phaseId: string, joint: CanonicalJointName, x: number, y: number) => void;
  nudgeJoint: (phaseId: string, joint: CanonicalJointName, dx: number, dy: number) => void;
  revertSelectedJoint: (phaseId: string, joint: CanonicalJointName) => void;
  updateDrillMetadata: (field: "title" | "difficulty" | "defaultView", value: string) => void;
  updatePackageMetadata: (field: "schemaVersion" | "packageId" | "packageVersion", value: string) => void;
};

const StudioStateContext = createContext<StudioStateValue | undefined>(undefined);

function createInitialPackages(): EditablePackageEntry[] {
  return SAMPLE_PACKAGE_DEFINITIONS.flatMap((sample) => {
    const result = loadPackageFromUnknown(sample.payload, `sample-${sample.id}`, `sample:${sample.id}`);

    if (!result.ok) {
      return [];
    }

    return [createEditablePackageEntry(result.packageViewModel.packageKey, `sample:${sample.id}`, result.packageViewModel.package)];
  });
}

export function StudioStateProvider({ children }: { children: React.ReactNode }) {
  const [packages, setPackages] = useState<EditablePackageEntry[]>(() => createInitialPackages());
  const [selectedPackageKey, setSelectedPackageKey] = useState<string | null>(() => createInitialPackages()[0]?.packageKey ?? null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(() => {
    const first = createInitialPackages()[0];
    const firstPhase = first ? getSortedPhases(first.workingPackage)[0] : null;
    return firstPhase?.phaseId ?? null;
  });
  const [selectedJointName, setSelectedJointName] = useState<CanonicalJointName | null>(null);
  const [importFeedback, setImportFeedback] = useState<ImportFeedback>({ status: "idle", message: "", issues: [] });

  const selectedPackage = useMemo(() => packages.find((item) => item.packageKey === selectedPackageKey) ?? null, [packages, selectedPackageKey]);

  const saveStatusLabel = selectedPackage
    ? selectedPackage.isDirty
      ? `Unsaved changes (${selectedPackage.sourceLabel})`
      : `Saved (${selectedPackage.sourceLabel})`
    : "No drill loaded";

  async function importFromFile(file: File): Promise<void> {
    const packageKey = packageKeyFromFile(file);
    const result = await readPackageFile(file, packageKey);

    if (!result.ok) {
      setImportFeedback({
        status: "error",
        message: result.error,
        issues: result.validation?.issues ?? []
      });
      return;
    }

    const nextEntry = createEditablePackageEntry(result.packageViewModel.packageKey, `local-file:${file.name}`, result.packageViewModel.package);

    setPackages((current) => {
      const withoutExisting = current.filter(
        (entry) => entry.workingPackage.manifest.packageId !== result.packageViewModel.package.manifest.packageId
      );

      return [nextEntry, ...withoutExisting];
    });

    setSelectedPackageKey(nextEntry.packageKey);
    setSelectedPhaseId(getSortedPhases(nextEntry.workingPackage)[0]?.phaseId ?? null);
    setSelectedJointName(null);
    setImportFeedback({
      status: "success",
      message: `Imported drill file ${file.name} successfully.`,
      issues: nextEntry.validation.issues
    });
  }

  function loadSampleById(sampleId: string): void {
    const sample = SAMPLE_PACKAGE_DEFINITIONS.find((entry) => entry.id === sampleId);
    if (!sample) {
      setImportFeedback({ status: "error", message: `Sample drill '${sampleId}' was not found.`, issues: [] });
      return;
    }

    const result = loadPackageFromUnknown(sample.payload, `${sample.id}-${Date.now()}`, `sample:${sample.id}`);

    if (!result.ok) {
      setImportFeedback({
        status: "error",
        message: `Failed to load sample drill '${sample.label}'.`,
        issues: result.validation?.issues ?? []
      });
      return;
    }

    const nextEntry = createEditablePackageEntry(result.packageViewModel.packageKey, `sample:${sample.id}`, result.packageViewModel.package);
    setPackages((current) => {
      const withoutExisting = current.filter(
        (entry) => entry.workingPackage.manifest.packageId !== result.packageViewModel.package.manifest.packageId
      );

      return [nextEntry, ...withoutExisting];
    });

    setSelectedPackageKey(nextEntry.packageKey);
    setSelectedPhaseId(getSortedPhases(nextEntry.workingPackage)[0]?.phaseId ?? null);
    setSelectedJointName(null);
    setImportFeedback({
      status: "success",
      message: `Loaded sample drill '${sample.label}'.`,
      issues: nextEntry.validation.issues
    });
  }

  function selectPackage(packageKey: string): void {
    setSelectedPackageKey(packageKey);
    const next = packages.find((entry) => entry.packageKey === packageKey);
    setSelectedPhaseId(next ? getSortedPhases(next.workingPackage)[0]?.phaseId ?? null : null);
    setSelectedJointName(null);
  }

  function selectPhase(phaseId: string | null): void {
    setSelectedPhaseId(phaseId);
    setSelectedJointName(null);
  }

  function selectJoint(jointName: CanonicalJointName | null): void {
    setSelectedJointName(jointName);
  }

  function updateSelectedPackage(mutator: (entry: EditablePackageEntry) => EditablePackageEntry, nextSelection?: (updated: EditablePackageEntry) => void): void {
    if (!selectedPackageKey) {
      return;
    }

    setPackages((current) =>
      current.map((entry) => {
        if (entry.packageKey !== selectedPackageKey) {
          return entry;
        }

        const updated = mutator(entry);
        nextSelection?.(updated);
        return updated;
      })
    );
  }

  function withPhaseUpdate(phaseId: string, callback: (phase: PortablePhase, view: PortableViewType) => void): void {
    updateSelectedPackage((entry) =>
      updateWorkingPackage(entry, (draft) => {
        const drill = getPrimaryDrill(draft);
        if (!drill) {
          return;
        }

        const phase = drill.phases.find((item) => item.phaseId === phaseId);
        if (!phase) {
          return;
        }

        callback(phase, drill.defaultView);
      })
    );
  }

  function renamePhase(phaseId: string, title: string): void {
    withPhaseUpdate(phaseId, (phase) => {
      phase.title = title;
    });
  }

  function setPhaseDuration(phaseId: string, durationMs: number): void {
    withPhaseUpdate(phaseId, (phase) => {
      phase.durationMs = durationMs;
    });
  }

  function setPhaseSummary(phaseId: string, summary: string): void {
    withPhaseUpdate(phaseId, (phase) => {
      phase.summary = summary;
    });
  }

  function setPhaseView(phaseId: string, view: PortableViewType): void {
    withPhaseUpdate(phaseId, (phase) => {
      phase.poseSequence = phase.poseSequence.map((pose) => ({
        ...pose,
        canvas: {
          ...pose.canvas,
          view
        }
      }));
    });
  }

  function addPhase(): void {
    let createdPhaseId: string | null = null;
    updateSelectedPackage(
      (entry) =>
        updateWorkingPackage(entry, (draft) => {
          const drill = getPrimaryDrill(draft);
          if (!drill) {
            return;
          }

          normalizePhaseOrder(draft);
          const phases = getSortedPhases(draft);
          const nextOrder = phases.length + 1;
          const phaseId = ensureUniquePhaseId(phases, "phase_new");
          createdPhaseId = phaseId;
          drill.phases.push(createNewPhase(phaseId, nextOrder, drill.defaultView));
          normalizePhaseOrder(draft);
        }),
      (updated) => {
        if (createdPhaseId) {
          setSelectedPhaseId(createdPhaseId);
          return;
        }

        const phases = getSortedPhases(updated.workingPackage);
        setSelectedPhaseId(phases[phases.length - 1]?.phaseId ?? null);
      }
    );
  }

  function deletePhase(phaseId: string): void {
    const deletingSelectedPhase = selectedPhaseId === phaseId;
    let fallbackPhaseAfterDelete: string | null = null;

    updateSelectedPackage(
      (entry) =>
        updateWorkingPackage(entry, (draft) => {
          const drill = getPrimaryDrill(draft);
          if (!drill) {
            return;
          }

          const sortedBeforeDelete = getSortedPhases(draft);
          const deletedIndex = sortedBeforeDelete.findIndex((phase) => phase.phaseId === phaseId);
          drill.phases = drill.phases.filter((phase) => phase.phaseId !== phaseId);
          normalizePhaseOrder(draft);

          if (deletingSelectedPhase) {
            const sortedAfterDelete = getSortedPhases(draft);
            if (sortedAfterDelete.length === 0) {
              fallbackPhaseAfterDelete = null;
              return;
            }

            const neighborIndex = deletedIndex >= sortedAfterDelete.length ? sortedAfterDelete.length - 1 : deletedIndex;
            fallbackPhaseAfterDelete = sortedAfterDelete[Math.max(0, neighborIndex)]?.phaseId ?? sortedAfterDelete[0].phaseId;
          }
        }),
      () => {
        if (!deletingSelectedPhase) {
          return;
        }

        setSelectedPhaseId(fallbackPhaseAfterDelete);
        setSelectedJointName(null);
      }
    );
  }

  function duplicatePhase(phaseId: string): void {
    let duplicatedPhaseId: string | null = null;
    updateSelectedPackage(
      (entry) =>
        updateWorkingPackage(entry, (draft) => {
          const drill = getPrimaryDrill(draft);
          if (!drill) {
            return;
          }

          normalizePhaseOrder(draft);
          const phases = getSortedPhases(draft);
          const sourceIndex = phases.findIndex((phase) => phase.phaseId === phaseId);
          const source = phases[sourceIndex];
          if (!source) {
            return;
          }

          const duplicateId = ensureUniquePhaseId(phases, `${source.phaseId}_copy`);
          duplicatedPhaseId = duplicateId;
          const duplicated = structuredClone(source);

          duplicated.phaseId = duplicateId;
          duplicated.title = `${source.title} (Copy)`;
          duplicated.order = source.order + 1;

          drill.phases = phases.flatMap((phase) => {
            if (phase.phaseId === source.phaseId) {
              return [phase, duplicated];
            }

            return [phase];
          });
          normalizePhaseOrder(draft);
      }),
      (updated) => {
        const duplicate = getSortedPhases(updated.workingPackage).find((phase) => phase.phaseId === duplicatedPhaseId);
        if (duplicate) {
          setSelectedPhaseId(duplicate.phaseId);
        }
      }
    );
  }

  function movePhase(phaseId: string, direction: "up" | "down"): void {
    updateSelectedPackage((entry) =>
      updateWorkingPackage(entry, (draft) => {
        const drill = getPrimaryDrill(draft);
        if (!drill) {
          return;
        }

        const phases = getSortedPhases(draft);
        const index = phases.findIndex((phase) => phase.phaseId === phaseId);
        const swapIndex = direction === "up" ? index - 1 : index + 1;

        if (index < 0 || swapIndex < 0 || swapIndex >= phases.length) {
          return;
        }

        const next = [...phases];
        [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
        drill.phases = next.map((phase, order) => ({ ...phase, order: order + 1 }));
      })
    );
  }

  function setJointCoordinates(phaseId: string, joint: CanonicalJointName, x: number, y: number): void {
    withPhaseUpdate(phaseId, (phase, view) => {
      setJointCoordinate(phase, joint, { x, y }, view);
    });
  }

  function nudgeJoint(phaseId: string, joint: CanonicalJointName, dx: number, dy: number): void {
    withPhaseUpdate(phaseId, (phase, view) => {
      const pose = phase.poseSequence[0];
      const current = pose?.joints[joint] ?? { x: 0.5, y: 0.5 };
      setJointCoordinate(phase, joint, { x: current.x + dx, y: current.y + dy }, view);
    });
  }

  function revertSelectedJoint(phaseId: string, joint: CanonicalJointName): void {
    if (!selectedPackage) {
      return;
    }

    const sourceDrill = getPrimaryDrill(selectedPackage.sourcePackage);
    const sourcePhase = sourceDrill?.phases.find((phase) => phase.phaseId === phaseId);
    const sourceJoint = sourcePhase?.poseSequence[0]?.joints[joint];

    if (!sourceJoint) {
      return;
    }

    setJointCoordinates(phaseId, joint, sourceJoint.x, sourceJoint.y);
  }


  function updateDrillMetadata(field: "title" | "difficulty" | "defaultView", value: string): void {
    updateSelectedPackage((entry) =>
      updateWorkingPackage(entry, (draft) => {
        const drill = getPrimaryDrill(draft);
        if (!drill) {
          return;
        }

        if (field === "title") {
          drill.title = value;
          return;
        }

        if (field === "difficulty") {
          drill.difficulty = value as typeof drill.difficulty;
          return;
        }

        drill.defaultView = value as PortableViewType;
      })
    );
  }

  function updatePackageMetadata(field: "schemaVersion" | "packageId" | "packageVersion", value: string): void {
    updateSelectedPackage((entry) =>
      updateWorkingPackage(entry, (draft) => {
        if (field === "schemaVersion") {
          draft.manifest.schemaVersion = value as SchemaVersion;
          return;
        }

        if (field === "packageId") {
          draft.manifest.packageId = value;
          return;
        }

        draft.manifest.packageVersion = value;
      })
    );
  }

  function exportSelectedPackage(): void {
    if (!selectedPackage) {
      setImportFeedback({ status: "error", message: "No drill file available to export.", issues: [] });
      return;
    }

    const exportPackage = clonePackage(selectedPackage.workingPackage);
    exportPackage.manifest.updatedAtIso = new Date().toISOString();
    const validation = validatePortableDrillPackage(exportPackage);

    downloadPackageJson(exportPackage);
    setImportFeedback({
      status: "success",
      message: `Exported drill file ${exportPackage.manifest.packageId}.`,
      issues: validation.issues
    });
  }

  const value: StudioStateValue = {
    packages,
    selectedPackageKey,
    selectedPhaseId,
    selectedJointName,
    importFeedback,
    saveStatusLabel,
    selectedPackage,
    selectPackage,
    selectPhase,
    selectJoint,
    loadSampleById,
    importFromFile,
    exportSelectedPackage,
    renamePhase,
    setPhaseDuration,
    setPhaseSummary,
    setPhaseView,
    addPhase,
    deletePhase,
    duplicatePhase,
    movePhase,
    setJointCoordinates,
    nudgeJoint,
    revertSelectedJoint,
    updateDrillMetadata,
    updatePackageMetadata
  };

  return <StudioStateContext.Provider value={value}>{children}</StudioStateContext.Provider>;
}

export function useStudioState(): StudioStateValue {
  const context = useContext(StudioStateContext);

  if (!context) {
    throw new Error("useStudioState must be used within StudioStateProvider.");
  }

  return context;
}
