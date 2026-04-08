import { createDerivedPackage, ensureVersioningMetadata, getPrimarySamplePackage } from "@/lib/package";
import { createRegistryEntryFromPackage } from "@/lib/registry/catalog";
import type { PackageInstallResult, PackageRegistryEntry, PackageSourceType } from "@/lib/registry/types";
import type { DrillPackage, DrillPackageRelationType } from "@/lib/schema/contracts";

const REGISTRY_STORAGE_KEY = "calivision.registry.v1";

type PersistedRegistry = {
  entries: PackageRegistryEntry[];
};

export function loadLocalRegistryEntries(): PackageRegistryEntry[] {
  if (typeof window === "undefined") {
    return [
      createRegistryEntryFromPackage({
        packageJson: getPrimarySamplePackage(),
        sourceType: "authored-local",
        sourceLabel: "sample:reactive-defense"
      })
    ];
  }

  const raw = window.localStorage.getItem(REGISTRY_STORAGE_KEY);

  if (!raw) {
    const seeded = [
      createRegistryEntryFromPackage({
        packageJson: getPrimarySamplePackage(),
        sourceType: "authored-local",
        sourceLabel: "sample:reactive-defense"
      })
    ];
    saveLocalRegistryEntries(seeded);
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedRegistry;
    return normalizePersistedEntries(parsed.entries ?? []);
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

export function deleteRegistryEntry(entryId: string): boolean {
  const current = loadLocalRegistryEntries();
  const next = current.filter((entry) => entry.entryId !== entryId);
  if (next.length === current.length) {
    return false;
  }

  saveLocalRegistryEntries(attachLineageEntryIds(next));
  return true;
}

export function deleteRegistryEntriesByPackageId(packageId: string): number {
  const current = loadLocalRegistryEntries();
  const next = current.filter((entry) => entry.summary.packageId !== packageId);
  if (next.length === current.length) {
    return 0;
  }

  saveLocalRegistryEntries(attachLineageEntryIds(next));
  return current.length - next.length;
}

export function upsertRegistryEntryFromPackage(input: {
  packageJson: DrillPackage;
  sourceType: PackageSourceType;
  sourceLabel: string;
  publishedAtIso?: string;
  parentEntryId?: string;
}): PackageRegistryEntry {
  const normalizedPackage = ensureVersioningMetadata(input.packageJson);
  const next = createRegistryEntryFromPackage({ ...input, packageJson: normalizedPackage });
  const current = loadLocalRegistryEntries();
  const duplicateVersion = current.find(
    (entry) =>
      entry.summary.packageId === next.summary.packageId && entry.summary.packageVersion === next.summary.packageVersion && entry.entryId !== next.entryId
  );
  if (duplicateVersion) {
    throw new Error(`Duplicate version conflict for ${next.summary.packageId}@${next.summary.packageVersion}.`);
  }
  const merged = attachLineageEntryIds([next, ...current.filter((entry) => entry.entryId !== next.entryId)]);
  saveLocalRegistryEntries(merged);
  return next;
}

export function createDerivedRegistryEntry(input: {
  entryId: string;
  relation: Extract<DrillPackageRelationType, "duplicate" | "fork" | "remix" | "new-version">;
}): PackageRegistryEntry {
  const current = loadLocalRegistryEntries();
  const source = current.find((entry) => entry.entryId === input.entryId);
  if (!source) {
    throw new Error("Source package was not found.");
  }

  const nextPackage = createDerivedPackage({
    source: source.details.packageJson,
    relation: input.relation
  });

  if (nextPackage.manifest.versioning?.derivedFrom) {
    nextPackage.manifest.versioning.derivedFrom.parentEntryId = source.entryId;
  }

  return upsertRegistryEntryFromPackage({
    packageJson: nextPackage,
    sourceType: "authored-local",
    sourceLabel: `${input.relation}:${source.entryId}`,
    parentEntryId: source.entryId
  });
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

  const installedSourceLabel = `installed-from:${match.entryId}`;
  const installed = createRegistryEntryFromPackage({
    packageJson: match.details.packageJson,
    sourceType: "installed-local",
    sourceLabel: installedSourceLabel,
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

function normalizePersistedEntries(entries: PackageRegistryEntry[]): PackageRegistryEntry[] {
  const normalized = entries.map((entry) => {
    if (entry.summary?.provenanceSummary && entry.summary?.statusBadge && Array.isArray(entry.details?.lineageEntryIds)) {
      return entry;
    }

    return createRegistryEntryFromPackage({
      packageJson: ensureVersioningMetadata(entry.details.packageJson),
      sourceType: entry.summary.sourceType,
      sourceLabel: entry.details.origin.sourceLabel,
      parentEntryId: entry.details.origin.parentEntryId,
      publishedAtIso: entry.summary.publishedAtIso
    });
  });

  return attachLineageEntryIds(normalized);
}

function attachLineageEntryIds(entries: PackageRegistryEntry[]): PackageRegistryEntry[] {
  return entries
    .map((entry) => ({
      ...entry,
      details: {
        ...entry.details,
        lineageEntryIds: entries
          .filter((candidate) => candidate.summary.lineageId && candidate.summary.lineageId === entry.summary.lineageId)
          .map((candidate) => candidate.entryId)
      }
    }))
    .sort((a, b) => b.summary.updatedAtIso.localeCompare(a.summary.updatedAtIso));
}
