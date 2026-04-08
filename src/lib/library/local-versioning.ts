import type { DrillPackage } from "../schema/contracts.ts";

export type LocalVersionSnapshot = {
  drillId: string;
  versionNumber: number;
  status: "draft" | "ready";
  updatedAtIso: string;
};

export function reconcileLocalVersionSnapshots<T extends LocalVersionSnapshot>(versions: T[]): T[] {
  const byDrill = new Map<string, T[]>();
  for (const version of versions) {
    const current = byDrill.get(version.drillId) ?? [];
    current.push(version);
    byDrill.set(version.drillId, current);
  }

  const reconciled: T[] = [];

  for (const drillVersions of byDrill.values()) {
    const releasedByNumber = new Map<number, T>();
    for (const version of drillVersions.filter((item) => item.status === "ready")) {
      const existing = releasedByNumber.get(version.versionNumber);
      if (!existing || new Date(version.updatedAtIso).getTime() > new Date(existing.updatedAtIso).getTime()) {
        releasedByNumber.set(version.versionNumber, version);
      }
    }

    const released = Array.from(releasedByNumber.values()).sort((a, b) => b.versionNumber - a.versionNumber);
    const maxReleasedVersion = released[0]?.versionNumber ?? 0;
    const openDraft = drillVersions
      .filter((item) => item.status === "draft")
      .sort((a, b) => new Date(b.updatedAtIso).getTime() - new Date(a.updatedAtIso).getTime())[0];

    reconciled.push(...released);
    if (openDraft) {
      const nextVersion = maxReleasedVersion + 1;
      reconciled.push(openDraft.versionNumber > maxReleasedVersion ? openDraft : ({ ...openDraft, versionNumber: nextVersion } as T));
    }
  }

  return reconciled;
}

function parseVersionNumber(pkg: DrillPackage): number {
  const revision = pkg.manifest.versioning?.revision;
  if (typeof revision === "number" && Number.isFinite(revision) && revision > 0) return Math.floor(revision);
  const parsed = Number.parseInt(pkg.manifest.packageVersion.split(".").at(-1) ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function bumpPatchVersion(version: string): string {
  const [majorRaw, minorRaw, patchRaw] = version.split(".");
  const major = Number.parseInt(majorRaw ?? "0", 10);
  const minor = Number.parseInt(minorRaw ?? "1", 10);
  const patch = Number.parseInt(patchRaw ?? "0", 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return "0.1.0";
  }
  return `${major}.${minor}.${patch + 1}`;
}

export function normalizeReadyPackageFromDraft(input: {
  draftPackage: DrillPackage;
  maxReadyVersionNumber: number;
  maxReadyPackageVersion?: string;
}): DrillPackage {
  const pkg = structuredClone(input.draftPackage);
  const versioning = pkg.manifest.versioning;
  pkg.manifest.versioning = {
    packageSlug: versioning?.packageSlug ?? pkg.manifest.packageId,
    versionId: versioning?.versionId ?? `${pkg.manifest.packageId}@${pkg.manifest.packageVersion}`,
    revision: Math.max(1, versioning?.revision ?? 1),
    lineageId: versioning?.lineageId ?? pkg.manifest.packageId,
    draftStatus: versioning?.draftStatus ?? "draft",
    derivedFrom: versioning?.derivedFrom
  };
  if (parseVersionNumber(pkg) <= input.maxReadyVersionNumber) {
    pkg.manifest.packageVersion = input.maxReadyPackageVersion ? bumpPatchVersion(input.maxReadyPackageVersion) : bumpPatchVersion(pkg.manifest.packageVersion);
  }
  pkg.manifest.versioning = {
    ...(pkg.manifest.versioning ?? {}),
    packageSlug: pkg.manifest.versioning?.packageSlug ?? pkg.manifest.packageId,
    versionId: `${pkg.manifest.packageId}@${pkg.manifest.packageVersion}`,
    revision: Math.max(pkg.manifest.versioning?.revision ?? parseVersionNumber(pkg), input.maxReadyVersionNumber + 1),
    lineageId: pkg.manifest.versioning?.lineageId ?? pkg.manifest.packageId,
    draftStatus: "publish-ready"
  };
  pkg.manifest.updatedAtIso = new Date().toISOString();
  return pkg;
}
