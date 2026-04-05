# Android Compatibility

## Compatibility posture

Android remains the behavioral reference for package semantics. Studio must mirror stabilized Android package expectations rather than inventing divergent payloads.

## Mandatory contract alignment

- Preserve canonical joint naming parity.
- Preserve normalized coordinate semantics.
- Preserve explicit phase order + duration behavior.
- Preserve manifest-driven schema compatibility checks.
- Keep Studio package IO/export payloads Android-consumable.

## PR2 interoperability additions

Studio now supports local package workflows that keep Android semantics central:

1. **Local import** reads unknown JSON payloads and validates contract semantics before loading.
2. **Validation output** separates blocking errors from warnings with field-path references.
3. **Sample package fixture** demonstrates Android-compatible contract usage in `samples/`.
4. **Local export** serializes currently loaded package back to JSON without Studio-only fields.

## Integration expectations for Android consumers

1. Parse `DrillManifest` and verify schema support.
2. Load drill phase order deterministically from `PortablePhase.order`.
3. Resolve assets from `PortableAssetRef` values.
4. Handle additive unknown fields without crashing.

## Guardrails

- Do not leak Studio-only editing state into portable runtime contracts.
- Do not introduce alternate coordinate systems without explicit versioning.
- Do not rename canonical joints without cross-platform migration planning.
- Do not change phase timing semantics without Android migration notes.

## Current baseline

- Contract baseline: `0.1.0`
- Producer source in sample fixtures: `web-studio`
- Sample payloads in `samples/` are compatibility review fixtures.
