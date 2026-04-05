# Portable Drill Package Spec (PR2 Local IO + Validation)

## Goal

Define and validate a portable package shape that mirrors Android-stabilized semantics while keeping room for additive evolution.

## Core types

- `SchemaVersion` — current contract baseline (`0.1.0`).
- `DrillPackage` — top-level payload containing manifest, drills, and assets.
- `DrillManifest` — producer + version + compatibility metadata.
- `PortableDrill` — drill metadata and ordered phases.
- `PortablePhase` — explicit phase order with duration/timing and pose/asset references.
- `PortablePose` — timestamped joint map in normalized 2D space.
- `PortableAssetRef` — media reference and metadata for package resolution.
- `PortableCanvasSpec` — coordinate system + view metadata.
- `PortableViewType` — canonical camera/view context.
- `CanonicalJointName` — stable joint name vocabulary shared across clients.

## Local package IO foundation (PR2)

New package namespace:
- `src/lib/package/import/`
- `src/lib/package/export/`
- `src/lib/package/validation/`
- `src/lib/package/mapping/`
- `src/lib/package/samples/`

Capabilities:
1. Load bundled sample package JSON.
2. Import local `.json` package files from browser file picker.
3. Parse and validate unknown payloads safely with structured issues.
4. Export currently loaded package as downloadable JSON.

## Validation philosophy

Validation is explicit runtime logic and is **not** treated as “TypeScript-only safety.”

Structured outputs:
- `PackageValidationIssue`
- `PackageValidationResult`
- severities: `error | warning`
- issue `path` references for targeted UI feedback

Fatal validation (`error`) blocks package acceptance. Warnings are surfaced but non-blocking.

### Current PR2 checks

- manifest presence
- schema version presence + support check
- drill presence
- unique phase ordering
- required phase id/title fields
- timing sanity (`durationMs > 0`, non-negative offsets/timestamps)
- normalized coordinates in `[0, 1]`
- canonical joint names only
- asset ref object + required string fields
- non-empty required strings

## Semantics

### Coordinates

- Contract uses `normalized-2d` coordinates (`x`, `y` in a [0,1] reference frame).
- Import validation rejects out-of-range coordinates.

### Joint names

Joint keys must come from the canonical `CanonicalJointName` set. Unknown joints are invalid.

### Phase ordering and timing

- `PortablePhase.order` is required and explicit.
- `PortablePhase.durationMs` is required and positive.
- `PortablePhase.startOffsetMs` (if present) must be non-negative.
- `PortablePose.timestampMs` must be non-negative.

### Manifest versioning

- `manifest.schemaVersion` communicates contract shape.
- Additive changes should remain backwards-compatible.
- Breaking changes require schema version bump + migration notes.

## Evolution notes

Planned follow-up additions:
- schema evolution strategy docs and migration helpers,
- richer asset resolution semantics,
- phase editing + pose canvas pipelines in later PRs.
