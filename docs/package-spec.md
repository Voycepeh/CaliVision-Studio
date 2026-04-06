# Portable Drill Package Spec (PR9 Publishing Groundwork)

## Contract baseline

Define a portable package shape that stays Android-compatible while preparing Studio for future hosted package sharing.

## Portable asset model updates

- `SchemaVersion` — contract baseline (`0.1.0`).
- `DrillPackage` — top-level payload with `manifest`, `drills`, `assets`.
- `DrillManifest` — package identity/version/compatibility metadata.
- `DrillPackagePublishingMetadata` — optional publish-oriented metadata placeholders.
- `PortableDrill` — drill metadata + ordered phases.
- `PortablePhase` — explicit phase order with timing and pose/asset refs.
- `PortablePose` — timestamped canonical joint map in normalized 2D.
- `PortableAssetRef` — media reference metadata.

## Manifest publishing metadata (additive, optional)

`manifest.publishing` is optional and intended for Studio publish-prep and future hosted listing.

Fields:
- `title?`
- `summary?`
- `description?`
- `authorDisplayName?`
- `tags?`
- `categories?`
- `visibility?` (`private | unlisted | public`)
- `publishStatus?` (`draft | published`)
- `latestArtifactChecksumSha256?`
- `lastPreparedAtIso?`

### Canonical portability guidance

- Core runtime portability stays in existing manifest/drill/phase/pose fields.
- `manifest.publishing` is additive metadata and should be treated as ignorable by consumers that do not support hosted sharing features.

## Publish architecture vocabulary (Studio internal)

- `PublishArtifact` — generated publish-ready package payload + checksum/size metadata.
- `PackageLocator` — stable locator abstraction (`mock://...` now, hosted URI/key later).
- `StorageProvider` — artifact payload persistence seam.
- `PackageRegistryAdapter` — metadata/listing seam.
- `PackagePublishService` — orchestrates storage + registry calls.

## Validation model

### Base package validation

`validatePortableDrillPackage` continues checking contract safety for import/export.

### Publish readiness validation

`validatePackagePublishReadiness` adds publish-focused checks:
- required package id/version,
- publish title + summary completeness,
- phase presence,
- advisory warnings for missing phase summaries/assets/pose sequences,
- artifact-generation viability.

Errors block publishing; warnings are advisory.

## PR9 intentional deferrals

- No real backend publish API.
- No auth.
- No marketplace browsing/search.
- No social/moderation features.
