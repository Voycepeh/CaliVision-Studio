import { validatePortableDrillPackage } from "../package/index.ts";
import type { DrillPackage } from "../schema/contracts.ts";
import type {
  PackageCatalog,
  PackageDetails,
  PackageListingQuery,
  PackageOrigin,
  PackageRegistryEntry,
  PackageSourceType,
  PackageSummary
} from "./types.ts";
import { createEntryId } from "./identity.ts";

export const DEFAULT_PACKAGE_LISTING_QUERY: PackageListingQuery = {
  searchText: "",
  sourceTypes: [],
  tags: [],
  sortBy: "updated-desc"
};

export function createRegistryEntryFromPackage(input: {
  packageJson: DrillPackage;
  sourceType: PackageSourceType;
  sourceLabel: string;
  publishedAtIso?: string;
  parentEntryId?: string;
}): PackageRegistryEntry {
  const drill = input.packageJson.drills[0];
  const publishing = input.packageJson.manifest.publishing;
  const validation = validatePortableDrillPackage(input.packageJson);

  const title = publishing?.title ?? drill?.title ?? input.packageJson.manifest.packageId;
  const tags = publishing?.tags ?? drill?.tags ?? [];
  const categories = publishing?.categories ?? [];
  const updatedAtIso = input.packageJson.manifest.updatedAtIso || new Date().toISOString();
  const phaseCount = input.packageJson.drills.reduce((count, item) => count + item.phases.length, 0);
  const warnings = validation.issues.filter((issue) => issue.severity !== "error").map((issue) => issue.message);
  const artifactId = `${input.packageJson.manifest.packageId}@${input.packageJson.manifest.packageVersion}`;
  const entryId = createEntryId({
    packageId: input.packageJson.manifest.packageId,
    packageVersion: input.packageJson.manifest.packageVersion,
    sourceType: input.sourceType,
    sourceLabel: input.sourceLabel,
    parentEntryId: input.parentEntryId
  });

  const summary: PackageSummary = {
    entryId,
    artifactId,
    packageId: input.packageJson.manifest.packageId,
    packageVersion: input.packageJson.manifest.packageVersion,
    title,
    authorDisplayName: publishing?.authorDisplayName || "Local Studio Author",
    tags,
    categories,
    phaseCount,
    assetCount: input.packageJson.assets.length,
    hasAssets: input.packageJson.assets.length > 0,
    compatibilitySummary: `${input.packageJson.manifest.compatibility.androidTargetContract} • Android ${input.packageJson.manifest.compatibility.androidMinVersion}+`,
    schemaVersion: input.packageJson.manifest.schemaVersion,
    updatedAtIso,
    publishedAtIso: input.publishedAtIso,
    publishStatus: input.sourceType === "mock-published" ? "published" : publishing?.publishStatus ?? "draft",
    sourceType: input.sourceType
  };

  const origin: PackageOrigin = {
    sourceType: input.sourceType,
    sourceLabel: input.sourceLabel,
    createdBy: mapSourceTypeToCreatedBy(input.sourceType),
    parentEntryId: input.parentEntryId
  };

  const details: PackageDetails = {
    summary,
    packageJson: input.packageJson,
    description: publishing?.description ?? publishing?.summary ?? drill?.description ?? "No package description provided yet.",
    phaseTitles: drill?.phases.map((phase) => phase.title) ?? [],
    origin,
    compatibility: {
      schemaVersion: input.packageJson.manifest.schemaVersion,
      androidMinVersion: input.packageJson.manifest.compatibility.androidMinVersion,
      androidTargetContract: input.packageJson.manifest.compatibility.androidTargetContract,
      validationSummary: validation.isValid ? "valid" : "warning",
      warnings: warnings.slice(0, 5)
    }
  };

  return {
    entryId,
    artifactId,
    summary,
    details
  };
}

export function isSameLogicalRegistryEntry(
  entry: PackageRegistryEntry,
  input: {
    packageId: string;
    packageVersion: string;
    sourceType: PackageSourceType;
    sourceLabel: string;
    parentEntryId?: string;
  }
): boolean {
  const expectedEntryId = createEntryId(input);
  if (entry.entryId === expectedEntryId) {
    return true;
  }

  if (
    entry.summary.packageId !== input.packageId ||
    entry.summary.packageVersion !== input.packageVersion ||
    entry.summary.sourceType !== input.sourceType
  ) {
    return false;
  }

  const sourceLabel = entry.details.origin.sourceLabel?.trim().toLocaleLowerCase();
  const inputSourceLabel = input.sourceLabel.trim().toLocaleLowerCase();
  const entryParentId = entry.details.origin.parentEntryId?.trim().toLocaleLowerCase();
  const inputParentId = input.parentEntryId?.trim().toLocaleLowerCase();

  if (inputParentId || entryParentId) {
    return inputParentId === entryParentId;
  }

  if (sourceLabel && inputSourceLabel) {
    return sourceLabel === inputSourceLabel;
  }

  return true;
}

export function queryPackageCatalog(entries: PackageRegistryEntry[], query: PackageListingQuery): PackageCatalog {
  const searchLower = query.searchText.trim().toLowerCase();

  const filtered = entries.filter((entry) => {
    const summary = entry.summary;
    const matchesSearch =
      searchLower.length === 0 ||
      summary.title.toLowerCase().includes(searchLower) ||
      summary.packageId.toLowerCase().includes(searchLower);

    const matchesSource = query.sourceTypes.length === 0 || query.sourceTypes.includes(summary.sourceType);

    const entryTags = new Set([...summary.tags, ...summary.categories].map((tag) => tag.toLowerCase()));
    const matchesTags =
      query.tags.length === 0 || query.tags.some((tag) => entryTags.has(tag.toLowerCase()));

    return matchesSearch && matchesSource && matchesTags;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (query.sortBy === "title-asc") {
      return a.summary.title.localeCompare(b.summary.title);
    }

    if (query.sortBy === "publish-status") {
      const byStatus = a.summary.publishStatus.localeCompare(b.summary.publishStatus);
      return byStatus !== 0 ? byStatus : b.summary.updatedAtIso.localeCompare(a.summary.updatedAtIso);
    }

    return b.summary.updatedAtIso.localeCompare(a.summary.updatedAtIso);
  });

  return {
    entries: sorted,
    totalCount: sorted.length,
    query
  };
}

export function collectCatalogTags(entries: PackageRegistryEntry[]): string[] {
  const set = new Set<string>();

  entries.forEach((entry) => {
    entry.summary.tags.forEach((tag) => set.add(tag));
    entry.summary.categories.forEach((category) => set.add(category));
  });

  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function mapSourceTypeToCreatedBy(sourceType: PackageSourceType): PackageOrigin["createdBy"] {
  if (sourceType === "imported-local") {
    return "external-import";
  }

  if (sourceType === "mock-published") {
    return "mock-registry";
  }

  if (sourceType === "future-remote") {
    return "future-remote";
  }

  return "studio-user";
}
