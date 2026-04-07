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
- `PortableDrillAnalysis`, `PortablePhaseAnalysis`, `PortablePhaseMatchHints`
- `AnalysisSession`, `FramePhaseSample`, `AnalysisEvent` (typed analysis output models)

### `PortableDrill` required field note

`PortableDrill.drillType` is required and currently supports:
- `hold`
- `rep`

Studio authoring should always capture this in the main Drill Studio workflow. It is not optional metadata.

## Drill analysis schema v1 (additive)

`PortableDrill.analysis` is optional/additive and supports:

- `measurementType`: `rep | hold | hybrid`
- ordered sequence: `orderedPhaseSequence`
- critical phase references: `criticalPhaseIds`
- explicit skip paths: `allowedPhaseSkips`
- temporal stability controls:
  - `minimumConfirmationFrames`
  - `exitGraceFrames`
  - `minimumRepDurationMs`
  - optional `maximumRepDurationMs`
  - `cooldownMs`
  - `entryConfirmationFrames`
  - `minimumHoldDurationMs`
- hold targeting: optional `targetHoldPhaseId`

Design intent:
- rep detection is phase-progression based,
- authored animation duration is not required for rep counting,
- hold drills have explicit entry/exit stability controls,
- schema remains extensible for future confidence/visibility matching rules.

## Phase analysis metadata (additive)

`PortablePhase.analysis` is optional and currently supports:
- `semanticRole`: `start | bottom | top | lockout | transition | hold`
- `isCritical`
- `matchHints` placeholder object:
  - `requiredJoints`
  - `optionalJoints`
  - `toleranceProfile`
  - `viewHint`

This is intentionally a typed placeholder and does not implement scoring logic.

## Analysis output models (schema-only for now)

To support future Upload Video and live-analysis flows, typed models are defined for:
- `AnalysisSession`
- `FramePhaseSample`
- `AnalysisEvent`

These are contract/types only in this phase (no runtime engine wiring yet).

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

Identity note for Drill Studio authoring UX:
- `drillId`: internal authored-drill identifier (system-managed).
- `slug`: user-facing friendly identifier for naming/linkability.
- package/export identifiers (`manifest.packageId`, bundle/distribution references): portability/distribution concern, not primary authoring identity fields.

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
- no cloud storage references in core package schema,
- no analysis classifier/scorer implementation in package contract layer.
