export {
  loadPackageFromJsonText,
  loadPackageFromUnknown,
  packageKeyFromFile,
  packageKeyFromSample,
  readPackageFile,
  validateImportedPackage
} from "@/lib/package/import/load-package";
export type {
  ImportedBundle,
  ImportedBundleAsset,
  LoadPackageFailure,
  LoadPackageResult,
  LoadPackageSuccess
} from "@/lib/package/import/load-package";

export {
  buildBundleForExport,
  createPackageExportFileName,
  downloadPackageBundle,
  downloadPackageJson,
  serializeBundleForExport,
  serializePackageForExport
} from "@/lib/package/export/export-package";
export type { ExportBundleResult, ExportWarning } from "@/lib/package/export/export-package";

export {
  getPrimarySamplePackage,
  SAMPLE_PACKAGE_DEFINITIONS,
  type SamplePackageDefinition
} from "@/lib/package/samples";

export {
  mapDrillToViewModel,
  mapPackageToStudioViewModel,
  mapPhaseToViewModel,
  type StudioDrillViewModel,
  type StudioPackageListItem,
  type StudioPackageViewModel,
  type StudioPhaseViewModel
} from "@/lib/package/mapping/view-models";

export {
  parsePackageJson,
  toValidatedPackage,
  validatePhaseTimingConsistency,
  validatePortableDrillPackage,
  type PackageValidationIssue,
  type PackageValidationResult
} from "@/lib/package/validation/validate-package";

export {
  createDerivedPackage,
  ensureVersioningMetadata,
  summarizeProvenance
} from "@/lib/package/versioning";

export {
  mapPortablePhaseToInspectorViewModel,
  mapPortablePoseToCanvasPoseModel,
  type CanvasPoseModel,
  type InspectorPhaseViewModel
} from "@/lib/package/mapping/canvas-view-models";
