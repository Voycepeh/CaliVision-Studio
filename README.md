# CaliVision Studio

CaliVision Studio is a **web-first, package-first drill authoring workspace** with a local-first library/registry model that prepares the app for a future hosted marketplace.

## Current scope (PR10)

Included:
- package authoring, import/export, validation, image-assisted pose editing, and animation preview,
- publish prep + local/mock publish abstractions,
- local-first package registry/catalog models (`src/lib/registry/*`),
- purposeful Library / Packages / Marketplace route semantics,
- local browse/search/filter/sort for package listings,
- package detail groundwork with provenance/status and compatibility surfacing,
- local install-style workflow concept for registry entries.

Intentionally deferred:
- auth and user identity,
- real remote storage/registry/search backend,
- social interactions (likes/comments/ratings),
- moderation/admin tooling,
- cross-user package sharing.

## Route map

- `/` - project entry and route index
- `/studio` - flagship authoring workspace (open package by `?packageId=`)
- `/library` - local package inventory management (authored/imported/installed)
- `/packages` - package artifact transport + compatibility surface
- `/marketplace` - local/mock discovery groundwork for future hosted marketplace

## Local-first workflow

1. Open Studio and import or edit a package.
2. Run publish readiness checks and local/mock publish (optional).
3. Browse/manage local entries in **Library**.
4. Use **Marketplace** route to preview discovery semantics on mock-published listings.
5. Open any listed package back into Studio for editing.

## Getting started

```bash
npm install
npm run dev
```

Open: <http://localhost:3000>

## Additional docs

- `docs/product-direction.md`
- `docs/architecture.md`
- `docs/package-spec.md`
- `docs/android-compatibility.md`
- `docs/roadmap.md`
- `docs/pr-plan.md`
