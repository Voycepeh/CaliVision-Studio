# Android Compatibility

## Compatibility posture

Android remains the behavioral reference for package semantics. PR11 adds additive versioning/provenance metadata and local-first lineage UX without altering canonical drill motion semantics.

## PR8 compatibility commitments

- Preserve canonical joint naming and normalized coordinate semantics.
- Preserve explicit phase order/timing behavior.
- Preserve manifest-driven schema compatibility fields.
- Keep Studio export payloads Android-consumable.
- Treat `manifest.publishing` as additive metadata Android can ignore safely.

## PR11 compatibility notes

1. **Artifact contract remains backward-compatible**
   - `src/lib/schema/contracts.ts` remains canonical and Android-portable.
   - `manifest.versioning` is optional/additive metadata.
2. **Registry/listing is external metadata**
   - New local registry entries are Studio-side wrappers around package artifacts (`src/lib/registry/*`).
3. **Provenance is UI/catalog-only**
   - Source types like `authored-local` / `mock-published` describe listing origin, not Android runtime semantics.
4. **Export/import interoperability preserved**
   - Package import/export continues to rely on existing package validation and JSON artifact paths.
5. **Lineage semantics do not change runtime execution**
   - Fork/remix/new-version data informs authoring/discovery workflows only.

## Current baseline

- Contract baseline: `0.1.0`
- `PortableDrill.drillType` is required (`hold | rep`) and should be treated as core drill logic metadata.
- Sample payloads remain Android-compatible.
- Registry/marketplace behavior in PR11 is local/mock only and does not add runtime coupling for mobile.
