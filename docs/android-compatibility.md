# Android Compatibility

## Compatibility posture

Android remains the behavioral reference for package semantics. Studio must mirror stabilized Android package expectations rather than inventing divergent payloads.

## Mandatory contract alignment

- Preserve canonical joint naming parity.
- Preserve normalized coordinate semantics.
- Preserve explicit phase order + duration behavior.
- Preserve manifest-driven schema compatibility checks.
- Keep Studio package IO/export payloads Android-consumable.
- Keep Studio authoring terminology Android-compatible by mapping UI-facing **Head** to canonical `nose` in package data.

## PR5 detector interoperability posture

PR5 adds MediaPipe image detection as an **authoring assist**, not as a package/runtime contract.

1. **Canonical contract remains source of truth**: detector outputs are mapped into canonical `PortablePose.joints` only.
2. **No detector leakage in package payload**: raw MediaPipe landmarks/structures are not stored in exported package JSON.
3. **Normalized coordinates preserved**: mapped joints remain `[0,1]` values.
4. **Partial detections are explicit**: warnings are surfaced in Studio and require explicit user apply.
5. **Non-destructive failure behavior**: failed detections do not silently overwrite phase pose data.
6. **Phase asset refs stay compatible**: temporary local source image refs are stripped at export, so unresolved `local://phase-images/...` URIs are not shipped in portable JSON.

## Integration expectations for Android consumers

1. Parse `DrillManifest` and verify schema support.
2. Load drill phase order deterministically from `PortablePhase.order`.
3. Resolve assets from `PortableAssetRef` values.
4. Handle additive unknown fields without crashing.

## Guardrails

- Do not leak Studio-only editor state into portable runtime contracts.
- Do not introduce alternate coordinate systems without explicit versioning.
- Do not rename canonical joints without cross-platform migration planning.
- Do not expose alternate face-landmark authoring terminology that changes exported canonical keys.
- Do not change phase timing semantics without Android migration notes.
- Do not accept detector-specific joints in canonical portable pose rendering/export paths.

## Current baseline

- Contract baseline: `0.1.0`
- Producer source in sample fixtures: `web-studio`
- Sample payloads in `samples/` remain compatibility review fixtures.
