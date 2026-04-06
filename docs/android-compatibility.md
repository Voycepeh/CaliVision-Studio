# Android Compatibility

## Compatibility posture

Android remains the behavioral reference for portable package semantics. PR8 adds local-first bundled assets while preserving JSON contract compatibility.

## PR8 compatibility commitments

1. **Schema stability**: `schemaVersion` remains `0.1.0`; additive fields are optional.
2. **Portable URI predictability**: packaged assets use deterministic `package://assets/...` paths.
3. **Portable roles**: source images/thumbnails/previews are tagged via additive `role` values.
4. **Ownership metadata**: additive `ownerDrillId` / `ownerPhaseId` supports future cross-client mapping.
5. **JSON backward compatibility**: existing JSON-only payloads remain importable in Studio.
6. **No browser-only assumptions in contract**: object URLs and overlay transforms remain Studio implementation details.

## Portable vs Studio-only model

Portable contract data:
- `PortableAssetRef` with `assetId`, `uri`, `type`, optional `role`, `owner*`, MIME/size metadata.
- `PortableDrill.thumbnailAssetId` / `previewAssetId` references.

Studio-only implementation detail:
- in-memory object URLs,
- per-phase overlay controls,
- bundled file transport encoding (`base64Data`) used only for local import/export packaging.

## Android consumer guidance

- Resolve `package://assets/...` references against local package container/storage.
- Prefer `thumbnailAssetId` when present for drill cards/list previews.
- Treat unknown additive fields as non-fatal.
- Continue canonical pose/joint parsing unchanged.

## Deferred intentionally

- remote object storage/publishing
- auth and package ownership
- marketplace distribution
- video derivation/transcoding pipelines
