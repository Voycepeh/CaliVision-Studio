import { clonePackage } from "@/lib/editor/package-editor";
import type { DrillPackage, DrillPackageRelationType } from "@/lib/schema/contracts";

type DerivePackageInput = {
  source: DrillPackage;
  relation: DrillPackageRelationType;
  nowIso?: string;
};

export function ensureVersioningMetadata(drillPackage: DrillPackage): DrillPackage {
  const next = clonePackage(drillPackage);
  const manifest = next.manifest;
  const versionId = `${manifest.packageId}@${manifest.packageVersion}`;
  const lineageId = manifest.versioning?.lineageId ?? manifest.packageId;

  manifest.versioning = {
    packageSlug: manifest.versioning?.packageSlug ?? toSlug(manifest.packageId),
    versionId,
    revision: Math.max(1, manifest.versioning?.revision ?? 1),
    lineageId,
    draftStatus: manifest.versioning?.draftStatus ?? "draft",
    derivedFrom: manifest.versioning?.derivedFrom
  };

  return next;
}

export function createDerivedPackage(input: DerivePackageInput): DrillPackage {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const source = ensureVersioningMetadata(input.source);
  const next = clonePackage(source);
  const sourceVersionId = source.manifest.versioning?.versionId ?? `${source.manifest.packageId}@${source.manifest.packageVersion}`;

  if (input.relation === "new-version") {
    next.manifest.packageVersion = bumpPatchVersion(source.manifest.packageVersion);
    next.manifest.updatedAtIso = nowIso;
    next.manifest.versioning = {
      packageSlug: source.manifest.versioning?.packageSlug ?? toSlug(source.manifest.packageId),
      versionId: `${source.manifest.packageId}@${bumpPatchVersion(source.manifest.packageVersion)}`,
      lineageId: source.manifest.versioning?.lineageId ?? source.manifest.packageId,
      revision: (source.manifest.versioning?.revision ?? 1) + 1,
      draftStatus: "draft",
      derivedFrom: {
        relation: "new-version",
        parentPackageId: source.manifest.packageId,
        parentVersionId: sourceVersionId
      }
    };
    return next;
  }

  const nextPackageId = buildDerivedPackageId(source.manifest.packageId, input.relation);
  next.manifest.packageId = nextPackageId;
  next.manifest.packageVersion = "0.1.0";
  next.manifest.updatedAtIso = nowIso;
  next.manifest.createdAtIso = nowIso;
  next.manifest.versioning = {
    packageSlug: toSlug(nextPackageId),
    versionId: `${nextPackageId}@0.1.0`,
    lineageId: nextPackageId,
    revision: 1,
    draftStatus: "draft",
    derivedFrom: {
      relation: input.relation,
      parentPackageId: source.manifest.packageId,
      parentVersionId: sourceVersionId
    }
  };

  if (next.manifest.publishing?.title) {
    const prefix = input.relation === "duplicate" ? "Copy of" : input.relation === "fork" ? "Fork of" : "Remix of";
    next.manifest.publishing.title = `${prefix} ${next.manifest.publishing.title}`;
  }

  return next;
}

export function summarizeProvenance(drillPackage: DrillPackage): string {
  const provenance = drillPackage.manifest.versioning?.derivedFrom;
  if (!provenance) {
    return "Original local package";
  }

  const suffix = provenance.parentVersionId ? ` (${provenance.parentVersionId})` : "";
  if (provenance.relation === "new-version") {
    return `New version of ${provenance.parentPackageId}${suffix}`;
  }

  if (provenance.relation === "duplicate") {
    return `Duplicated from ${provenance.parentPackageId}${suffix}`;
  }

  if (provenance.relation === "fork") {
    return `Forked from ${provenance.parentPackageId}${suffix}`;
  }

  if (provenance.relation === "import") {
    return `Imported from ${provenance.parentPackageId}${suffix}`;
  }

  return `Remixed from ${provenance.parentPackageId}${suffix}`;
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildDerivedPackageId(packageId: string, relation: DrillPackageRelationType): string {
  const base = relation === "duplicate" ? "copy" : relation;
  const stamp =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().split("-")[0]
      : `${Date.now().toString(36)}`;
  return `${packageId}-${base}-${stamp}`;
}

function bumpPatchVersion(version: string): string {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return "0.1.0";
  }

  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}
