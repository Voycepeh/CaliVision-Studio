import { sampleDrillPackage } from "@/lib/mock/sample-package";
import { createRegistryEntryFromPackage } from "@/lib/registry/catalog";
import type { PackageInstallResult, PackageRegistryEntry, PackageSourceType } from "@/lib/registry/types";
import type { DrillPackage } from "@/lib/schema/contracts";

const REGISTRY_STORAGE_KEY = "calivision.registry.v1";

type PersistedRegistry = {
  entries: PackageRegistryEntry[];
};

export function loadLocalRegistryEntries(): PackageRegistryEntry[] {
  if (typeof window === "undefined") {
    return [
      createRegistryEntryFromPackage({
        packageJson: sampleDrillPackage,
        sourceType: "authored-local",
        sourceLabel: "sample:reactive-defense"
      })
    ];
  }

  const raw = window.localStorage.getItem(REGISTRY_STORAGE_KEY);

  if (!raw) {
    const seeded = [
      createRegistryEntryFromPackage({
        packageJson: sampleDrillPackage,
        sourceType: "authored-local",
        sourceLabel: "sample:reactive-defense"
      })
    ];
    saveLocalRegistryEntries(seeded);
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedRegistry;
    return parsed.entries ?? [];
  } catch {
    return [];
  }
}

export function saveLocalRegistryEntries(entries: PackageRegistryEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  const payload: PersistedRegistry = { entries };
  window.localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(payload));
}

export function upsertRegistryEntryFromPackage(input: {
  packageJson: DrillPackage;
  sourceType: PackageSourceType;
  sourceLabel: string;
  publishedAtIso?: string;
  parentEntryId?: string;
}): PackageRegistryEntry {
  const next = createRegistryEntryFromPackage(input);
  const current = loadLocalRegistryEntries();
  const filtered = current.filter((entry) => entry.entryId !== next.entryId);
  const merged = [next, ...filtered].sort((a, b) => b.summary.updatedAtIso.localeCompare(a.summary.updatedAtIso));
  saveLocalRegistryEntries(merged);
  return next;
}

export function installRegistryEntryToLibrary(entryId: string): PackageInstallResult {
  const current = loadLocalRegistryEntries();
  const match = current.find((entry) => entry.entryId === entryId);

  if (!match) {
    return {
      ok: false,
      entryId,
      packageId: "unknown",
      nextSourceType: "installed-local",
      message: "Package could not be found in local registry."
    };
  }

  const installed = createRegistryEntryFromPackage({
    packageJson: match.details.packageJson,
    sourceType: "installed-local",
    sourceLabel: `installed-from:${match.entryId}`,
    parentEntryId: match.entryId,
    publishedAtIso: match.summary.publishedAtIso
  });

  const filtered = current.filter((entry) => entry.entryId !== installed.entryId);
  saveLocalRegistryEntries([installed, ...filtered]);

  return {
    ok: true,
    entryId: installed.entryId,
    packageId: installed.summary.packageId,
    nextSourceType: "installed-local",
    message: `Installed ${installed.summary.title} into your local library.`
  };
}
