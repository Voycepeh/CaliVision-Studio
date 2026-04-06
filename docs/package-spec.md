# Portable Drill Package Spec (PR10 Library/Registry Groundwork)

## Goal

Preserve Android-compatible portable package payloads while introducing local-first registry/catalog semantics around (not inside) the package artifact.

## Core portable contract types

- `SchemaVersion` — contract baseline (`0.1.0`).
- `DrillPackage` — top-level payload with `manifest`, `drills`, `assets`.
- `DrillManifest` — package identity/version/compatibility metadata.
- `DrillPackagePublishingMetadata` — optional publish/discovery metadata placeholders.
- `PortableDrill`, `PortablePhase`, `PortablePose`, `PortableAssetRef`.

## PR10: registry model is separate from artifact model

PR10 adds a local registry/catalog layer (`src/lib/registry/*`) with types such as:
- `PackageRegistryEntry`
- `PackageSummary`
- `PackageDetails`
- `PackageOrigin`
- `PackageSourceType`
- `PackageListingQuery`

These are Studio listing/discovery concepts and are intentionally **not** embedded into the portable package contract.

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

## PR10 intentional deferrals

- No hosted registry schema/API contract yet.
- No auth identity in package metadata.
- No social metadata in package payload.
