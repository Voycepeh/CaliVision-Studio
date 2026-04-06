# PR Plan (Foundation and Sequencing)

## PR1–PR9 (completed)

- Delivered Studio foundation, package IO/validation, visual authoring workflows, detection/preview, and local/mock publishing abstractions.

## PR10 (this change) — local-first library/registry groundwork

### Summary

- Added explicit local registry/catalog models and query layer under `src/lib/registry/*`.
- Made Library, Packages, and Marketplace routes purposeful and non-overlapping.
- Added local browse/search/filter/sort and package detail groundwork.
- Added provenance/status visibility and local install-style workflow concept.
- Wired Studio import/sample/mock-publish flows to keep local registry listings current.

### Assumptions

- Studio remains the authoring source of truth.
- Portable package contract remains stable and Android-compatible.
- Registry/listing remains local-first with no backend dependencies.

### Non-goals (intentionally deferred)

- Real auth and identity.
- Real hosted registry/storage/search.
- Social, moderation, and user-to-user sharing features.

## Recommended next PRs

1. **PR11:** user-facing package versioning and fork/remix workflow foundations.
2. **PR12:** real backend/auth/storage integration plan and first hosted environment setup.
3. **PR13:** hosted package publishing implementation behind existing publishing abstractions.

## PR11 (follow-up) — deep-link/state correctness and registry identity stability

### Summary

- Fixes Studio deep-link initialization so `?packageId=` applies once per route intent instead of replaying on every package mutation.
- Adds deterministic phase-selection fallback logic that preserves current package/phase/joint selections unless the selected phase is removed.
- Introduces explicit artifact identity (`packageId@packageVersion`) separate from registry entry identity (`entryId`) so authored/imported, published, and installed states can coexist.
- Adds local registry hydration normalization for legacy entries saved before the entry identity split.

### Assumptions

- Local-first registry/catalog direction from PR10 remains unchanged.
- Existing IA labels and user mental model for Library/Packages/Marketplace remain intact.
- Backward compatibility is maintained for previously persisted local registry entries.

### Non-goals

- No redesign of registry architecture beyond entry-identity correctness.
- No backend integration changes.
- No changes to portable drill contract semantics.
