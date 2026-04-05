# Android Compatibility

## Compatibility posture

Android remains the temporary behavioral reference for package semantics. Studio must mirror stabilized Android package expectations rather than inventing divergent payloads.

## Mandatory contract alignment

- Preserve canonical joint naming parity.
- Preserve normalized coordinate semantics.
- Preserve explicit phase order + duration behavior.
- Preserve manifest-driven schema compatibility checks.

## Integration expectations for Android consumers

1. Parse `DrillManifest` and verify schema support.
2. Load drill phase order deterministically from `PortablePhase.order`.
3. Resolve assets from `PortableAssetRef` values.
4. Handle additive unknown fields without crashing.

## Guardrails

- Do not leak Studio-only editing state into portable runtime contracts.
- Do not introduce alternate coordinate systems without explicit versioning.
- Do not rename canonical joints without cross-platform migration planning.

## Current baseline

- Contract baseline: `0.1.0`
- Producer source in PR1: `web-studio`
- Sample payloads in `samples/` are compatibility review fixtures.
