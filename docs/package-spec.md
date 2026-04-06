# Portable Drill Package Spec (PR11 Versioning + Provenance)

## Contract baseline

Preserve Android-compatible portable package payloads while introducing local-first registry/catalog semantics around (not inside) the package artifact.

## Core portable contract types

- `SchemaVersion` — contract baseline (`0.1.0`).
- `DrillPackage` — top-level payload with `manifest`, `drills`, `assets`.
- `DrillManifest` — package identity/version/compatibility metadata.
- `DrillPackageVersioningMetadata` — explicit package/version identity + lineage/provenance.
- `DrillPackagePublishingMetadata` — optional publish/discovery metadata placeholders.
- `PortableDrill`, `PortablePhase`, `PortablePose`, `PortableAssetRef`.

## PR11: versioning semantics in artifact + registry model separation

PR11 keeps registry/catalog as a Studio concern (`src/lib/registry/*`) with types such as:
- `PackageRegistryEntry`
- `PackageSummary`
- `PackageDetails`
- `PackageOrigin`
- `PackageSourceType`
- `PackageListingQuery`

These are Studio listing/discovery concepts that wrap the portable package contract.

Package-level version/provenance now lives in `manifest.versioning` (additive and optional):
- `packageSlug`
- `versionId` (`packageId@packageVersion`)
- `lineageId`
- `revision`
- `draftStatus` (`draft | publish-ready`)
- `derivedFrom`:
  - `relation` (`duplicate | fork | remix | new-version | import`)
  - `parentPackageId`
  - optional `parentVersionId`, `parentEntryId`, `note`

## Manifest publishing metadata (still additive)

`manifest.publishing` remains optional and forward-compatible:
- `title?`, `summary?`, `description?`
- `authorDisplayName?`
- `tags?`, `categories?`
- `visibility?` (`private | unlisted | public`)
- `publishStatus?` (`draft | published`)
- `latestArtifactChecksumSha256?`, `lastPreparedAtIso?`

Consumers that ignore this block remain compatible.

## Validation posture

- `validatePortableDrillPackage` continues protecting contract safety.
- Registry/listing compatibility status in Library/Marketplace is a surfaced summary built from existing validation outcomes.

## PR11 intentional deferrals

- No hosted registry schema/API contract yet.
- No auth identity in package metadata.
- No social metadata in package payload.
- No remote version graph conflict resolution.
