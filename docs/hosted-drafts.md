# Hosted drafts (legacy compatibility note)

As of April 8, 2026, **normal Studio edit/save/load lifecycle no longer uses `hosted_drafts`**.

## Active model

- `hosted_library` is the hosted source of truth for drill versions.
- Draft vs released version is represented by metadata (`manifest.versioning.draftStatus`), but UI semantics treat drafts separately from released version history.
- Library and Studio both target the same drill identity (`packageId`) and version identity (`versionId`).
- At most one open draft is allowed per drill identity; released versions remain immutable history (`v1`, `v2`, `v3`).
- Mark Ready finalizes the open draft into the next released version and closes draft state.

## Why `hosted_drafts` still exists

- Table remains for migration/backfill compatibility only.
- Legacy links that still provide `hostedDraftId` are treated as version-id fallback during transition.
- New library/studio flows should route with `drillId` / `versionId` semantics.

Android runtime/live coaching remains outside Studio in https://github.com/Voycepeh/CaliVision.
