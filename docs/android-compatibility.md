# Android Compatibility

## Compatibility posture

Android remains the behavioral reference for package semantics. Studio must mirror stabilized Android package expectations rather than inventing divergent payloads.

## Mandatory contract alignment

- Preserve canonical joint naming parity.
- Preserve normalized coordinate semantics.
- Preserve explicit phase order + duration behavior.
- Preserve manifest-driven schema compatibility checks.
- Keep Studio package IO/export payloads Android-consumable.

## PR4 authoring interoperability posture

Studio now renders package poses through a canonical visual surface while preserving Android semantics:

1. **Canonical joints only**: Studio pose renderer is restricted to portable `CanonicalJointName` values.
2. **Normalized coordinates preserved**: phase poses are mapped from `[0,1]` into a fixed portrait render surface.
3. **Deterministic phase preview**: selecting a phase in Studio always renders the same pose structure independent of image dimensions.
4. **Portable canvas metadata honored**: view metadata (`front`/`side`/`rear`/`three-quarter`) is surfaced in phase inspector summaries.
5. **Working-copy editing only**: Studio edits happen in-memory against a working copy and export back to the same portable contract.
6. **Portable timing semantics preserved**: Studio edits `durationMs` directly and keeps phase ordering explicit.
7. **Canonical coordinate editing preserved**: joint edits remain normalized `[0,1]` values and continue using canonical joint names.

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
- Do not accept detector-specific joints in canonical portable pose rendering paths.

## Current baseline

- Contract baseline: `0.1.0`
- Producer source in sample fixtures: `web-studio`
- Sample payloads in `samples/` are compatibility review fixtures.
