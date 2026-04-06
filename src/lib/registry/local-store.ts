import { sampleDrillPackage } from "../mock/sample-package.ts";
import { createRegistryEntryFromPackage, isSameLogicalRegistryEntry } from "./catalog.ts";
import { createArtifactId, upgradeLegacyEntryId } from "./identity.ts";
import type { PackageInstallResult, PackageRegistryEntry, PackageSourceType } from "./types.ts";
import type { DrillPackage } from "../schema/contracts.ts";

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
    const normalized = normalizePersistedEntries(parsed.entries ?? []);
    const changed = JSON.stringify(normalized) !== JSON.stringify(parsed.entries ?? []);

    if (changed) {
      saveLocalRegistryEntries(normalized);
    }

    return normalized;
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
  const filtered = current.filter(
    (entry) =>
      !isSameLogicalRegistryEntry(entry, {
        packageId: next.summary.packageId,
        packageVersion: next.summary.packageVersion,
        sourceType: next.summary.sourceType,
        sourceLabel: input.sourceLabel,
        parentEntryId: input.parentEntryId
      })
  );
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

  const installedSourceLabel = `installed-from:${match.entryId}`;
  const installed = createRegistryEntryFromPackage({
    packageJson: match.details.packageJson,
    sourceType: "installed-local",
    sourceLabel: installedSourceLabel,
    parentEntryId: match.entryId,
    publishedAtIso: match.summary.publishedAtIso
  });

  const filtered = current.filter(
    (entry) =>
      !isSameLogicalRegistryEntry(entry, {
        packageId: installed.summary.packageId,
        packageVersion: installed.summary.packageVersion,
        sourceType: "installed-local",
        sourceLabel: installedSourceLabel,
        parentEntryId: match.entryId
      })
  );
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
  return entries.map((entry) => normalizePersistedEntry(entry));
}

function normalizePersistedEntry(entry: PackageRegistryEntry): PackageRegistryEntry {
  const packageId = entry.summary?.packageId ?? entry.details?.packageJson?.manifest?.packageId ?? "unknown.package";
  const packageVersion = entry.summary?.packageVersion ?? entry.details?.packageJson?.manifest?.packageVersion ?? "0.0.0";
  const sourceType = entry.summary?.sourceType ?? entry.details?.origin?.sourceType ?? "authored-local";
  const sourceLabel = entry.details?.origin?.sourceLabel ?? `legacy:${entry.entryId}`;
  const parentEntryId = entry.details?.origin?.parentEntryId;
  const canonical = createRegistryEntryFromPackage({
    packageJson: entry.details?.packageJson ?? sampleDrillPackage,
    sourceType,
    sourceLabel,
    parentEntryId,
    publishedAtIso: entry.summary?.publishedAtIso
  });

  const artifactId = entry.artifactId ?? entry.summary?.artifactId ?? createArtifactId(packageId, packageVersion);

  const nextEntryId = upgradeLegacyEntryId({
    entryId: entry.entryId,
    packageId,
    packageVersion,
    sourceType,
    sourceLabel,
    parentEntryId
  });

  return {
    ...entry,
    entryId: nextEntryId,
    artifactId,
    summary: {
      ...canonical.summary,
      ...entry.summary,
      entryId: nextEntryId,
      artifactId,
      packageId,
      packageVersion,
      sourceType
    },
    details: {
      ...canonical.details,
      ...entry.details,
      summary: {
        ...canonical.summary,
        ...entry.details?.summary,
        entryId: nextEntryId,
        artifactId,
        packageId,
        packageVersion,
        sourceType
      },
      origin: {
        ...canonical.details.origin,
        ...entry.details?.origin,
        sourceType,
        sourceLabel,
        parentEntryId
      }
    }
  };
}
