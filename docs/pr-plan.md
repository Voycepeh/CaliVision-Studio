# PR Plan (Foundation and Sequencing)

## PR1–PR8 (completed)

- Established Studio web foundation, package IO, validation, authoring, image-assisted detection, and animation preview workflows.
- Preserved portable package compatibility and Android-aligned contract semantics.

## PR9 (this change) — publishing groundwork + storage abstraction

- Add `src/lib/publishing/*` abstraction layer for:
  - publish artifact generation,
  - publish transport interfaces,
  - storage provider seam,
  - metadata registry seam.
- Add local/mock publish flow in Studio:
  - run publish readiness checks,
  - generate artifact,
  - publish to in-memory mock storage + registry,
  - show locator/result/recent history in UI.
- Add publish metadata placeholders on manifest (`manifest.publishing`) without requiring backend.
- Keep export/download separate from publish flow.

## Assumptions

- Studio remains the authoring source of truth.
- Portable package contract remains Android-compatible and additive.
- Publishing in PR9 is local-only simulation to prove architecture seams.

## Non-goals (intentionally deferred)

- Real auth/identity.
- Real cloud storage/registry backend.
- Marketplace browsing/search UX.
- Social/moderation workflows.
- Runtime live-coaching concerns in Studio.

## Recommended next PR sequence

1. **PR10:** marketplace/library groundwork with local-first package registry concepts.
2. **PR11:** user-facing package versioning and fork/remix workflow foundations.
3. **PR12:** real backend/auth/storage integration plan and first hosted environment setup.
