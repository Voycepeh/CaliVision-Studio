"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import {
  downloadPackageJson,
  loadPackageFromUnknown,
  packageKeyFromFile,
  readPackageFile,
  SAMPLE_PACKAGE_DEFINITIONS,
  type PackageValidationIssue,
  type StudioPackageViewModel
} from "@/lib/package";

export type ImportFeedback = {
  status: "idle" | "success" | "error";
  message: string;
  issues: PackageValidationIssue[];
};

type StudioStateValue = {
  packages: StudioPackageViewModel[];
  selectedPackageKey: string | null;
  selectedPhaseId: string | null;
  importFeedback: ImportFeedback;
  saveStatusLabel: string;
  selectPackage: (packageKey: string) => void;
  selectPhase: (phaseId: string) => void;
  loadSampleById: (sampleId: string) => void;
  importFromFile: (file: File) => Promise<void>;
  exportSelectedPackage: () => void;
};

const StudioStateContext = createContext<StudioStateValue | undefined>(undefined);

function createInitialPackages(): StudioPackageViewModel[] {
  return SAMPLE_PACKAGE_DEFINITIONS.flatMap((sample) => {
    const result = loadPackageFromUnknown(sample.payload, `sample-${sample.id}`, `sample:${sample.id}`);

    if (!result.ok) {
      return [];
    }

    return [result.packageViewModel];
  });
}

export function StudioStateProvider({ children }: { children: React.ReactNode }) {
  const [packages, setPackages] = useState<StudioPackageViewModel[]>(() => createInitialPackages());
  const [selectedPackageKey, setSelectedPackageKey] = useState<string | null>(() => {
    const initialPackages = createInitialPackages();
    return initialPackages[0]?.packageKey ?? null;
  });
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [importFeedback, setImportFeedback] = useState<ImportFeedback>({ status: "idle", message: "", issues: [] });

  const selectedPackage = packages.find((item) => item.packageKey === selectedPackageKey) ?? null;

  const saveStatusLabel = selectedPackage ? `Loaded (${selectedPackage.listItem.sourceLabel})` : "No package loaded";

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

    setPackages((current) => {
      const withoutExisting = current.filter(
        (entry) => entry.package.manifest.packageId !== result.packageViewModel.package.manifest.packageId
      );

      return [result.packageViewModel, ...withoutExisting];
    });

    setSelectedPackageKey(result.packageViewModel.packageKey);
    setSelectedPhaseId(result.packageViewModel.primaryDrill?.phases[0]?.phaseId ?? null);
    setImportFeedback({
      status: "success",
      message: `Imported ${file.name} successfully.`,
      issues: result.packageViewModel.validation.issues
    });
  }

  function loadSampleById(sampleId: string): void {
    const sample = SAMPLE_PACKAGE_DEFINITIONS.find((entry) => entry.id === sampleId);
    if (!sample) {
      setImportFeedback({
        status: "error",
        message: `Sample '${sampleId}' was not found.`,
        issues: []
      });
      return;
    }

    const result = loadPackageFromUnknown(sample.payload, `${sample.id}-${Date.now()}`, `sample:${sample.id}`);

    if (!result.ok) {
      setImportFeedback({
        status: "error",
        message: `Failed to load sample '${sample.label}'.`,
        issues: result.validation?.issues ?? []
      });
      return;
    }

    setPackages((current) => [result.packageViewModel, ...current]);
    setSelectedPackageKey(result.packageViewModel.packageKey);
    setSelectedPhaseId(result.packageViewModel.primaryDrill?.phases[0]?.phaseId ?? null);
    setImportFeedback({
      status: "success",
      message: `Loaded sample '${sample.label}'.`,
      issues: result.packageViewModel.validation.issues
    });
  }

  function selectPackage(packageKey: string): void {
    setSelectedPackageKey(packageKey);
    const next = packages.find((entry) => entry.packageKey === packageKey);
    setSelectedPhaseId(next?.primaryDrill?.phases[0]?.phaseId ?? null);
  }

  function selectPhase(phaseId: string): void {
    setSelectedPhaseId(phaseId);
  }

  function exportSelectedPackage(): void {
    if (!selectedPackage) {
      setImportFeedback({
        status: "error",
        message: "No package available to export.",
        issues: []
      });
      return;
    }

    downloadPackageJson(selectedPackage.package);
    setImportFeedback({
      status: "success",
      message: `Exported ${selectedPackage.package.manifest.packageId}.`,
      issues: selectedPackage.validation.issues
    });
  }

  const value = useMemo<StudioStateValue>(
    () => ({
      packages,
      selectedPackageKey,
      selectedPhaseId,
      importFeedback,
      saveStatusLabel,
      selectPackage,
      selectPhase,
      loadSampleById,
      importFromFile,
      exportSelectedPackage
    }),
    [packages, selectedPackageKey, selectedPhaseId, importFeedback, saveStatusLabel]
  );

  return <StudioStateContext.Provider value={value}>{children}</StudioStateContext.Provider>;
}

export function useStudioState(): StudioStateValue {
  const context = useContext(StudioStateContext);

  if (!context) {
    throw new Error("useStudioState must be used within StudioStateProvider.");
  }

  return context;
}
