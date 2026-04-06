import { ensureVersioningMetadata, summarizeProvenance, validatePortableDrillPackage } from "@/lib/package";
import type { DrillPackage } from "@/lib/schema/contracts";
import type {
  PackageCatalog,
  PackageDetails,
  PackageListingQuery,
  PackageOrigin,
  PackageRegistryEntry,
  PackageSourceType,
  PackageSummary
} from "./types.ts";
import { createArtifactId, createEntryId } from "./identity.ts";

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
  const normalizedPackage = ensureVersioningMetadata(input.packageJson);
  const drill = normalizedPackage.drills[0];
  const publishing = normalizedPackage.manifest.publishing;
  const validation = validatePortableDrillPackage(normalizedPackage);

  const title = publishing?.title ?? drill?.title ?? input.packageJson.manifest.packageId;
  const tags = publishing?.tags ?? drill?.tags ?? [];
  const categories = publishing?.categories ?? [];
  const updatedAtIso = normalizedPackage.manifest.updatedAtIso || new Date().toISOString();
  const phaseCount = normalizedPackage.drills.reduce((count, item) => count + item.phases.length, 0);
  const warnings = validation.issues.filter((issue) => issue.severity !== "error").map((issue) => issue.message);
  const versioning = normalizedPackage.manifest.versioning;
  const provenanceSummary = summarizeProvenance(normalizedPackage);

  const summary: PackageSummary = {
    entryId: createEntryId(normalizedPackage.manifest.packageId, normalizedPackage.manifest.packageVersion),
    packageId: normalizedPackage.manifest.packageId,
    packageSlug: versioning?.packageSlug,
    versionId: versioning?.versionId,
    lineageId: versioning?.lineageId,
    revision: versioning?.revision,
    packageVersion: normalizedPackage.manifest.packageVersion,
    title,
    authorDisplayName: publishing?.authorDisplayName || "Local Studio Author",
    tags,
    categories,
    phaseCount,
    assetCount: normalizedPackage.assets.length,
    hasAssets: normalizedPackage.assets.length > 0,
    compatibilitySummary: `${normalizedPackage.manifest.compatibility.androidTargetContract} • Android ${normalizedPackage.manifest.compatibility.androidMinVersion}+`,
    schemaVersion: normalizedPackage.manifest.schemaVersion,
    updatedAtIso,
    publishedAtIso: input.publishedAtIso,
    publishStatus: input.sourceType === "mock-published" ? "published" : publishing?.publishStatus ?? "draft",
    sourceType: input.sourceType,
    provenanceSummary,
    statusBadge: resolveStatusBadge(input.sourceType, versioning?.derivedFrom?.relation)
  };

  const origin: PackageOrigin = {
    sourceType: input.sourceType,
    sourceLabel: input.sourceLabel,
    createdBy: mapSourceTypeToCreatedBy(input.sourceType),
    parentEntryId: input.parentEntryId
  };

  const details: PackageDetails = {
    summary,
    packageJson: normalizedPackage,
    description: publishing?.description ?? publishing?.summary ?? drill?.description ?? "No package description provided yet.",
    phaseTitles: drill?.phases.map((phase) => phase.title) ?? [],
    origin,
    lineageEntryIds: [],
    compatibility: {
      schemaVersion: normalizedPackage.manifest.schemaVersion,
      androidMinVersion: normalizedPackage.manifest.compatibility.androidMinVersion,
      androidTargetContract: normalizedPackage.manifest.compatibility.androidTargetContract,
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

function resolveStatusBadge(
  sourceType: PackageSourceType,
  relation?: "fork" | "remix" | "duplicate" | "new-version" | "import"
): PackageSummary["statusBadge"] {
  if (sourceType === "mock-published") {
    return "published";
  }
  if (sourceType === "imported-local" || relation === "import") {
    return "imported";
  }
  if (relation === "fork") {
    return "forked";
  }
  if (relation === "remix") {
    return "remixed";
  }
  if (relation === "new-version") {
    return "versioned";
  }
  return "local";
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
