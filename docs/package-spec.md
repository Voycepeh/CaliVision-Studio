# Portable Drill Package Spec (PR4 Editing Foundation)

## Goal

Define and validate a portable package shape that mirrors Android-stabilized semantics while adding a canonical Studio pose rendering foundation.

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

## Studio canonical pose canvas assumptions (PR3+)

Studio now uses a canonical portrait visual surface for deterministic phase pose preview.

Key assumptions:
1. Package pose coordinates remain normalized in `[0,1]` regardless of screen size.
2. Rendering uses a fixed canonical internal portrait reference (`1000x1600`), then scales responsively.
3. Pose rendering is independent of source image dimensions and independent of per-pose `widthRef`/`heightRef` for Studio preview geometry.
4. Only canonical joints from the portable contract are rendered.
5. Missing joints are allowed and render as partial skeletons.

## Local package IO + editing foundation (PR2 + PR4)

Package namespace:
- `src/lib/package/import/`
- `src/lib/package/export/`
- `src/lib/package/validation/`
- `src/lib/package/mapping/`
- `src/lib/package/samples/`

Pose/canvas namespace:
- `src/lib/pose/`
- `src/lib/canvas/`
- `src/components/studio/canvas/`

Capabilities:
1. Load bundled sample package JSON.
2. Import local `.json` package files from browser file picker.
3. Parse and validate unknown payloads safely with structured issues.
4. Export currently loaded package as downloadable JSON.
5. Render selected phase pose on canonical Studio canvas.
6. Surface non-destructive warnings for incomplete/partially populated pose data.
7. Maintain an explicit editable working copy in-memory (without mutating imported raw package objects).
8. Edit phase name/order/duration/summary and phase pose view metadata.
9. Edit canonical joints through canvas drag + inspector numeric controls using normalized coordinates.
10. Export edited working copy JSON payloads.

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

## Semantics

### Coordinates

- Contract uses `normalized-2d` coordinates (`x`, `y` in a `[0,1]` reference frame).
- Import validation rejects out-of-range coordinates.
- Studio import validation still rejects out-of-range coordinates for package acceptance.
- Studio canvas preview clamping is defensive and primarily intended for non-import transient editor state in future PRs.

### Joint names

Joint keys must come from the canonical `CanonicalJointName` set. Unknown joints are invalid.

### Phase ordering and timing

- `PortablePhase.order` is required and explicit.
- `PortablePhase.durationMs` is required and positive.
- `PortablePhase.startOffsetMs` (if present) must be non-negative.
- `PortablePose.timestampMs` must be non-negative.
- Studio phase editing keeps `order` explicit and re-normalized to contiguous sequence on reorder/add/delete.
- Studio timing editing currently focuses on `durationMs` and preserves explicit `startOffsetMs` values when present.

### Manifest versioning

- `manifest.schemaVersion` communicates contract shape.
- Additive changes should remain backwards-compatible.
- Breaking changes require schema version bump + migration notes.

## Evolution notes

Planned follow-up additions:
- MediaPipe detector-to-canonical mapping pipeline (PR5),
- source image overlay alignment workflow (PR6).
