# Architecture (PR11 Versioning + Fork/Remix Foundations)

## Intent

Keep Studio as the authoring source of truth while introducing a local-first registry/catalog layer that can later be backed by hosted services.

## Layering overview

- `src/lib/package/*`
  - package artifact IO, parsing, validation, import/export mechanics.
- `src/lib/publishing/*`
  - publish orchestration seam (artifact generation, storage provider, registry publish adapter).
- `src/lib/registry/*`
  - listing/catalog/domain layer for local library + marketplace discovery UX.

This separation keeps artifact payload concerns distinct from listing/query concerns.

## Registry/catalog model additions

`src/lib/registry/types.ts` defines:
- `PackageRegistryEntry`
- `PackageCatalog`
- `PackageSummary`
- `PackageDetails`
- `PackageInstallResult`
- `PackageOrigin`
- `PackageSourceType` (`authored-local`, `imported-local`, `mock-published`, `installed-local`, `future-remote`)
- `PackageListingQuery` / sort model

`src/lib/registry/catalog.ts` provides:
- package-to-registry mapping,
- local search/filter/sort query engine,
- shared tag collection helpers.
- provenance summaries and status badges.

`src/lib/registry/local-store.ts` provides:
- localStorage persistence for registry entries,
- sample seeding for first run,
- upsert/install operations for local workflows.
- local derived copy operations (`duplicate`, `fork/remix`, `new-version`).

## PR11 model additions

- `manifest.versioning` introduces explicit package/version identity:
  - `packageSlug`
  - `versionId`
  - `lineageId`
  - `revision`
  - `draftStatus`
  - optional `derivedFrom` provenance
- local registry entries now carry lineage/provenance summaries for UI.

## IA integration

- **Library** (`/library`): local package inventory management (authored/imported/installed) + detail view/actions.
- **Packages** (`/packages`): artifact transport/compatibility context and workflow guidance.
- **Marketplace** (`/marketplace`): local/mock discovery surface that previews future hosted registry UX.
- **Studio** (`/studio`): continues full authoring; accepts `?packageId=` for predictable open-from-library behavior.

## State flow

- Imports and sample loads in Studio now upsert local registry entries.
- Mock publish flow now also upserts a `mock-published` entry with provenance.
- Library and Marketplace read local registry entries and apply local query/filter/sort.

## Deferred by design

- No hosted auth/storage/search integration yet.
- No real multi-user registry.
- No social ranking or moderation.
