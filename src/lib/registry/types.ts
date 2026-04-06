import type { DrillPackage } from "@/lib/schema/contracts";

export type PackageSourceType = "authored-local" | "imported-local" | "mock-published" | "installed-local" | "future-remote";

export type PackageOrigin = {
  sourceType: PackageSourceType;
  sourceLabel: string;
  createdBy: "studio-user" | "external-import" | "mock-registry" | "future-remote";
  parentEntryId?: string;
};

export type PackageSummary = {
  entryId: string;
  artifactId: string;
  packageId: string;
  packageVersion: string;
  title: string;
  authorDisplayName: string;
  tags: string[];
  categories: string[];
  phaseCount: number;
  assetCount: number;
  hasAssets: boolean;
  compatibilitySummary: string;
  schemaVersion: string;
  updatedAtIso: string;
  publishedAtIso?: string;
  publishStatus: "draft" | "published";
  sourceType: PackageSourceType;
};

export type PackageCompatibilityInfo = {
  schemaVersion: string;
  androidMinVersion: string;
  androidTargetContract: string;
  validationSummary: "valid" | "warning";
  warnings: string[];
};

export type PackageDetails = {
  summary: PackageSummary;
  packageJson: DrillPackage;
  description: string;
  phaseTitles: string[];
  origin: PackageOrigin;
  compatibility: PackageCompatibilityInfo;
};

export type PackageRegistryEntry = {
  entryId: string;
  artifactId: string;
  summary: PackageSummary;
  details: PackageDetails;
};

export type PackageInstallResult = {
  ok: boolean;
  entryId: string;
  packageId: string;
  nextSourceType: PackageSourceType;
  message: string;
};

export type PackageListingSort = "updated-desc" | "title-asc" | "publish-status";

export type PackageListingQuery = {
  searchText: string;
  sourceTypes: PackageSourceType[];
  tags: string[];
  sortBy: PackageListingSort;
};

export type PackageCatalog = {
  entries: PackageRegistryEntry[];
  totalCount: number;
  query: PackageListingQuery;
};
