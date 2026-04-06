# Android Compatibility

## Compatibility posture

Android remains the behavioral reference for package semantics. PR10 adds local-first registry/listing UX without altering canonical drill contract semantics.

## Mandatory contract alignment

- Preserve canonical joint naming and normalized coordinate semantics.
- Preserve explicit phase order/timing behavior.
- Preserve manifest-driven schema compatibility fields.
- Keep Studio export payloads Android-consumable.
- Treat `manifest.publishing` as additive metadata Android can ignore safely.

## PR10 compatibility notes

1. **Artifact contract unchanged**
   - `src/lib/schema/contracts.ts` remains the canonical package contract for Android portability.
2. **Registry/listing is external metadata**
   - New local registry entries are Studio-side wrappers around package artifacts (`src/lib/registry/*`).
3. **Provenance is UI/catalog-only**
   - Source types like `authored-local` / `mock-published` describe listing origin, not Android runtime semantics.
4. **Export/import interoperability preserved**
   - Package import/export continues to rely on existing package validation and JSON artifact paths.

## Current baseline

- Contract baseline: `0.1.0`
- Sample payloads remain Android-compatible.
- Registry/marketplace behavior in PR10 is local/mock only and does not add runtime coupling for mobile.
