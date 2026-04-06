# PR Plan (Foundation and Sequencing)

## PR1-PR7 (completed)

- Core Studio shell, contract, validation, phase editing, image detection, overlay controls, and animation preview are complete.

## PR8 (this change)

- Add a **local-first bundled package** strategy for source images and thumbnails.
- Keep legacy JSON-only import working for backward compatibility.
- Introduce explicit portable asset roles (`phase-source-image`, `drill-thumbnail`, `drill-preview`).
- Add bundled import/export support via a structured `.cvpkg.json` payload with:
  - `manifest.json` equivalent data (`bundle.manifest`),
  - `drill.json` equivalent data (`bundle.drill`),
  - logical `assets/*` file entries (`bundle.files`).
- Wire imported bundled phase images into Studio overlay authoring state.
- Surface bundled/local asset state in left panel, phase details, and inspector summaries.
- Extend validation with asset type/role checks and duplicate asset id/path detection.

## Assumptions

- Android/mobile consumers can resolve `package://assets/...` references deterministically.
- Asset binaries are local authoring payloads in PR8; no remote storage or publishing is introduced.
- Thumbnail behavior is minimal: explicit `thumbnailAssetId` support with fallback to first phase source image at export.

## Non-goals (intentionally deferred)

- No auth, cloud persistence, or package publishing.
- No marketplace listing flow.
- No video packaging pipeline beyond placeholder `drill-preview` asset role.

## Recommended next PR sequence

1. **PR9:** package publishing groundwork and future storage abstraction.
2. **PR10:** marketplace/library groundwork with local-first package registry concepts.
3. **PR11:** user-facing package versioning and fork/remix workflow foundations.
