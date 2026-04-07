# Portable Drill Package Spec (Current Studio Baseline)

## Contract baseline

Portable drill package payloads remain the canonical cross-client artifact for Studio authoring and downstream runtime consumption.

Android/mobile runtime client reference: <https://github.com/Voycepeh/CaliVision>.

Canonical contract types live in:
- `src/lib/schema/contracts.ts`

Validation/parsing flows live in:
- `src/lib/package/validation/validate-package.ts`

## Core portable contract types

- `SchemaVersion` (`0.1.0`)
- `DrillPackage` (top-level payload)
- `DrillManifest` (identity/version/compatibility metadata)
- `DrillPackageVersioningMetadata` (lineage/provenance metadata)
- `DrillPackagePublishingMetadata` (optional publish/discovery metadata)
- `PortableDrill`, `PortablePhase`, `PortablePose`, `PortableAssetRef`

## Versioning + provenance semantics

`manifest.versioning` remains additive and optional:
- `packageSlug`
- `versionId` (`packageId@packageVersion`)
- `lineageId`
- `revision`
- `draftStatus` (`draft | publish-ready`)
- `derivedFrom`:
  - `relation` (`duplicate | fork | remix | new-version | import`)
  - `parentPackageId`
  - optional `parentVersionId`, `parentEntryId`, `note`

## Publishing metadata (additive)

`manifest.publishing` remains optional:
- `title`, `summary`, `description`
- `authorDisplayName`
- `tags`, `categories`
- `visibility` (`private | unlisted | public`)
- `publishStatus` (`draft | published`)
- `latestArtifactChecksumSha256`, `lastPreparedAtIso`

Consumers that ignore this block remain compatible.

## Studio wrapper model boundary

Studio registry/listing concepts live outside the package payload in `src/lib/registry/*` and are intentionally separate from artifact schema.

Examples:
- `PackageRegistryEntry`
- `PackageSummary`
- `PackageDetails`
- `PackageOrigin`
- `PackageSourceType`

## Sample payloads and fixtures

Canonical Studio sample fixtures used by runtime code:
- `src/lib/package/samples/valid-sample-package.json`
- `src/lib/package/samples/invalid-sample-package.json`

Documentation/manual fixture copies:
- `samples/sample-drill-package.json`
- `samples/sample-invalid-drill-package.json`

Keep these aligned whenever contract semantics change.

## Intentional deferrals

- no hosted registry schema/API contract,
- no auth identity inside portable package metadata,
- no backend conflict-resolution graph semantics,
- no cloud storage references in core package schema.
