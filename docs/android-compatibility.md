# Android Compatibility Notes

## Philosophy

Android is a **consumer/execution runtime** for packages authored in Studio. Authoring logic remains in web to avoid divergence.

## Contract expectations for Android

- Parse `DrillManifest` first.
- Verify supported `schemaVersion`.
- Resolve `PortableDrill` and iterate ordered phases.
- Treat `PortableAssetRef.uri` as relative or absolute based on package format rules.
- Handle missing optional fields defensively.

## Guardrails

- Do not push Studio-only editing state into runtime package contracts.
- Keep runtime payload deterministic and stable.
- Track compatibility decisions in docs before implementation.

## Planned implementation sequence

1. Android parser for PR1 sample payload.
2. Validation feedback loop from Android to Studio docs.
3. Version negotiation behavior for future schema bumps.
