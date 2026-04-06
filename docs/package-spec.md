# Portable Drill Package Spec (PR7 Animation Preview Validation Workflow)

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

Current view enum values:
- `front`
- `side`
- `rear`

## PR6 image-assisted detection workflow

Detection pipeline is intentionally adapter-based and image-first:

`uploaded image -> MediaPipe Pose (pose.js) landmarks -> DetectionResult -> canonical PortablePose -> phase editor`

Namespaces:
- `src/lib/detection/` — detector-agnostic detection result model + canonical mapping.
- `src/lib/detection/mediapipe/` — MediaPipe Pose runtime integration (`@mediapipe/pose/pose.js`) and landmark mapping.
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
- Studio standard authoring labels the canonical `nose` joint as **Head** in UI copy for parity with seeded drill authoring, while retaining `nose` as the canonical/internal key.
- No detector-specific/unsupported joint names are added to package pose payloads.
- Coordinates are normalized and clamped to `[0,1]`.
- Missing landmarks remain missing and are surfaced as warnings.
- Left/right semantics remain explicit via fixed landmark-to-canonical mapping table.

## Source image overlay + association behavior (temporary)

For PR6, phase source images and overlay alignment controls are local-only working state in browser memory.

- Studio stores file preview URL + metadata in local editor state.
- Studio stores overlay display metadata (layer visibility, opacity, fit mode, offsets) in editor state per selected phase.
- Studio can stage selected phase `assetRefs` with a local placeholder URI pattern (`local://phase-images/...`) for reviewability while editing.
- Overlay display metadata does **not** redefine `PortablePose` coordinates and is not exported as canonical package pose data.
- Export strips all local placeholder phase-image refs (`local://phase-images/...`) so downloaded JSON remains portable/Android-consumable.
- Exported package remains portable JSON contract; no binary embedding or remote upload is introduced in PR6.


## PR7 animation preview semantics

PR7 adds a Studio-only animation preview layer that reuses exported canonical package fields without adding new contract objects.

Preview source fields:
- ordered `PortablePhase` list (`order`)
- phase timing (`durationMs`)
- canonical pose endpoint (`poseSequence[0]`)

Preview assumptions:
- each phase `durationMs` is interpreted as the interpolation segment length from phase _n_ pose to phase _n+1_ pose,
- sequencing loops by default in Studio preview controls,
- single-phase drills are rendered as a timed hold.

Interpolation behavior:
- linear interpolation on normalized `x/y` coordinates,
- shared joints interpolate,
- missing joints in one endpoint fall back to the available endpoint value,
- if both endpoints are missing, that joint is omitted from the preview frame.

Compatibility note:
- preview output is derived/transient and is not serialized into package JSON,
- no new schema fields are required for PR7, preserving Android compatibility.

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
- PR8 local package asset bundling strategy for source images/thumbnails,
- PR9 package publishing groundwork and future storage abstraction,
- PR10 marketplace/library groundwork with local-first package registry concepts.
