# Portable Drill Package Spec (PR1 Direction)

## Goal

Define a portable package shape that mirrors Android-stabilized semantics while keeping room for additive evolution.

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

## Semantics

### Coordinates

- PR1 uses `normalized-2d` coordinates (`x`, `y` in a [0,1] reference frame).
- Consumers should clamp/validate values according to runtime policy.

### Joint names

Joint keys must come from the canonical set in `CanonicalJointName`. Unknown joints are invalid for strict consumers.

### Phase ordering and timing

- `PortablePhase.order` is required and explicit.
- `PortablePhase.durationMs` is required.
- `PortablePhase.startOffsetMs` enables deterministic sequence reconstruction.
- `PortablePose.timestampMs` supports pose sequence timing.

### Manifest versioning

- `manifest.schemaVersion` communicates contract shape.
- Additive changes should be backwards-compatible.
- Breaking changes require a version bump and migration notes.

## Evolution notes

Planned follow-up additions:
- JSON schema validation bundle,
- richer asset packaging metadata,
- optional phase-level validation constraints.
