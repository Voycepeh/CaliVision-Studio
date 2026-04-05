# Portable Drill Package Spec (PR5 Image Detection Mapping)

## Goal

Define and validate a portable package shape that mirrors Android-stabilized semantics while supporting Studio image-assisted pose authoring.

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

## PR5 image-assisted detection workflow

Detection pipeline is intentionally adapter-based and image-first:

`uploaded image -> MediaPipe landmarks -> DetectionResult -> canonical PortablePose -> phase editor`

Namespaces:
- `src/lib/detection/` — detector-agnostic detection result model + canonical mapping.
- `src/lib/detection/mediapipe/` — MediaPipe runtime integration and landmark mapping.
- `src/components/studio/detection/` — inspector workflow UI.

### Detector result model (Studio-internal)

`DetectionResult` is separate from raw MediaPipe output and separate from package export payloads.

It includes:
- mapped `DetectionJoint` entries keyed by canonical joint,
- confidence summary,
- issue/warning list for partial/low-confidence detection,
- detector metadata (runtime/model/image dimensions/timing).

### Canonical mapping rules

- Only canonical portable joints are mapped.
- No detector-specific/unsupported joint names are added to package pose payloads.
- Coordinates are normalized and clamped to `[0,1]`.
- Missing landmarks remain missing and are surfaced as warnings.
- Left/right semantics remain explicit via fixed landmark-to-canonical mapping table.

## Source image association behavior (temporary)

For PR5, phase source images are local-only working state in browser memory.

- Studio stores file preview URL + metadata in local editor state.
- Studio updates selected phase `assetRefs` with a local placeholder URI pattern (`local://phase-images/...`) for reviewability.
- Exported package remains portable JSON contract; no binary embedding or remote upload is introduced in PR5.

## Validation philosophy

Validation is explicit runtime logic and is **not** treated as “TypeScript-only safety.”

Structured outputs:
- `PackageValidationIssue`
- `PackageValidationResult`
- severities: `error | warning`
- issue `path` references for targeted UI feedback

Fatal validation (`error`) blocks package acceptance. Warnings are surfaced but non-blocking.

### Current checks

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

## Evolution notes

Planned follow-up additions:
- PR6 source image overlay alignment workflow,
- PR7 timeline animation preview,
- PR8 local asset bundling strategy for source images/thumbnails.
