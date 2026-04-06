# Portable Drill Package Spec (PR8 Local Asset Bundling)

## Contract baseline

- `schemaVersion`: `0.1.0` (unchanged)
- Backward compatible with legacy JSON-only package import.

## Portable asset model updates

`PortableAssetRef` now supports additive metadata:
- `role`: `phase-source-image | drill-thumbnail | drill-preview`
- `ownerDrillId?`
- `ownerPhaseId?`

`PortableDrill` now supports:
- `thumbnailAssetId?`
- `previewAssetId?`

Portable URI convention for bundled assets:
- `package://assets/phase-images/<stable-file>`
- `package://assets/thumbnails/<stable-file>`
- `package://assets/previews/<stable-file>`

Editor-local temporary URIs are still allowed while authoring but should not be relied on as portable contract.

## Bundled package structure (local-first)

Studio exports a bundle file (`.cvpkg.json`) with explicit logical structure:
- `manifest` (bundle metadata, versioned)
- `drill` (portable `DrillPackage`, equivalent to `drill.json`)
- `files[]` (binary payload entries, equivalent to `assets/*`)

Each `files[]` entry includes:
- `path` (for example `assets/phase-images/phase-1-stance.png`)
- `mimeType`
- `byteSize`
- `base64Data`

This is intentionally inspectable and easy to migrate to archive or hosted storage abstractions later.

## Import/export behavior

- **Import** accepts both:
  - legacy JSON package payloads,
  - bundled `.cvpkg.json` payloads with embedded files.
- **Export** emits bundled `.cvpkg.json` payloads and includes all `package://` assets with locally available binary data.
- If binary data is missing for a referenced packaged asset, export warns clearly and still exports valid package JSON state.

## Validation additions

- invalid asset `type`
- invalid asset `role`
- duplicate root asset ids
- duplicate root asset URIs
- malformed bundled base64 payloads
- missing bundled file entries referenced by manifest

## Future evolution notes

- PR9 will add publishing/storage abstraction on top of this local-first bundle strategy.
- PR10 will build marketplace/library indexing around stable asset ids and paths.
- PR11 will introduce user-facing package versioning and fork/remix workflows.
