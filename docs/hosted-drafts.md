# Hosted drafts (legacy compatibility note)

As of April 8, 2026, **normal Studio edit/save/load lifecycle no longer uses `hosted_drafts`**.

## Active model

- `hosted_library` is the hosted source of truth for drill versions.
- Draft vs Ready is represented by version metadata (`manifest.versioning.draftStatus`), not by separate tables in UI flow.
- Library and Studio both target the same drill identity (`packageId`) and version identity (`versionId`).

## Why `hosted_drafts` still exists

- Table remains for migration/backfill compatibility only.
- Legacy links that still provide `hostedDraftId` are treated as version-id fallback during transition.
- New library/studio flows should route with `drillId` / `versionId` semantics.

Android runtime/live coaching remains outside Studio in https://github.com/Voycepeh/CaliVision.
