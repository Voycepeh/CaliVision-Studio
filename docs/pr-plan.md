# PR Plan (Foundation and Sequencing)

## PR1–PR9 (completed)

- Delivered Studio foundation, package IO/validation, visual authoring workflows, detection/preview, and local/mock publishing abstractions.

## PR11 (this change) — user-facing versioning and fork/remix foundations

### Summary

- Added explicit `manifest.versioning` metadata for package identity vs version identity.
- Added local-first derived workflows: Duplicate, Fork/Remix, and New Version.
- Added lineage/provenance summaries to Library, Studio, Packages, and Marketplace surfaces.
- Added publish-readiness checks for version identity sanity and lineage conflicts.
- Extended local registry behavior for multi-version lineages and derived copies.

### Assumptions

- Studio remains the authoring source of truth.
- Portable package contract remains stable and Android-compatible.
- Registry/listing remains local-first with no backend dependencies.
- Versioning metadata is additive and backward-compatible.

### Non-goals (intentionally deferred)

- Real auth and identity.
- Real hosted registry/storage/search.
- Social, moderation, and user-to-user sharing features.
- Hosted lineage graph service and collaborative merge workflows.

## Recommended next PRs

1. **PR12:** real backend/auth/storage integration plan and first hosted environment setup.
2. **PR13:** hosted package publishing implementation behind existing publishing abstractions.
3. **PR14:** hosted registry/library retrieval and sync using the existing local-first marketplace model.
