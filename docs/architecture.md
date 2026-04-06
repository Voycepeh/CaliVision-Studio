# Architecture (PR9 Publishing Groundwork)

## Intent

Preserve Studio as the visual authoring source of truth while adding clear seams for future hosted package sharing.

## Current app structure

- `src/app/*` — App Router pages.
- `src/components/layout/*` — shell and top bar.
- `src/components/studio/*` — authoring workspace + publish prep UI.
- `src/lib/schema/contracts.ts` — portable package contract.
- `src/lib/package/*` — package import/export/validation utilities.
- `src/lib/publishing/*` — publish abstraction, artifact generation, readiness validation, and mock providers.
- `samples/*` — compatibility fixtures.

## PR9 publishing seam

PR9 introduces a three-part publish architecture:

1. **Artifact generation**
   - `createPublishArtifact` produces a publish-ready package artifact from editor state.
   - Artifact generation remains local and reuses portable JSON export semantics.
2. **Storage provider abstraction**
   - `StorageProvider` receives artifact payloads and returns a `PackageLocator`.
   - PR9 implementation: `MockStorageProvider` (`mock://` locators).
3. **Registry adapter abstraction**
   - `PackageRegistryAdapter` records metadata/listing state for published artifacts.
   - PR9 implementation: `MockPackageRegistryAdapter` (in-memory recent list).

`PackagePublishService` composes storage + registry so future hosted implementations can be added without rewriting editor UI/state.

## UI integration

- Top bar **Publish** action now opens a right-panel publish prep workspace.
- Publish panel supports:
  - metadata preparation,
  - readiness validation (error vs warning),
  - local/mock publish execution,
  - recent local/mock publish result visibility.
- Export/download remains a separate top-bar action.

## Deferred by design

- No auth or identity.
- No Supabase/Vercel/cloud backend integration.
- No hosted registry browsing/marketplace search.
- No social/moderation features.
