# PR Plan — Library Workflow Cleanup + Draft/Drill Lifecycle Fix

## Summary

This pass simplifies `/library` into a clear manage/resume flow and separates **local drafts** from **saved drills** so users do not get accidental dual registration.

## Assumptions

- Studio remains the web-first source of truth for drill authoring.
- Mobile runtime responsibilities stay in Android: <https://github.com/Voycepeh/CaliVision>.
- Local-first browser persistence (IndexedDB + localStorage) remains the active storage model.

## Non-goals

- no hosted backend sync/auth/storage,
- no package contract/schema changes,
- no Android runtime behavior changes,
- no Drill Exchange backend implementation.

## Scope

- Remove redundant Library intro/hero duplication.
- Keep Library IA focused on: header actions, recent local drafts, My drills, and secondary tools.
- Add explicit `Save to library` promotion from local draft to drill library item.
- Ensure drill duplication from Library creates a draft copy for editing.
- Add explicit drill delete action in My drills.
- Ensure drill deletion also removes linked draft records for the same package/version to avoid orphans.
- Keep draft deletion isolated to draft persistence only.

## Follow-up candidates (not included)

- richer draft-to-drill promotion UX (rename/version prompts),
- bulk drill management actions,
- stronger linking model between promoted drills and later diverged drafts,
- automated migration for legacy mirrored draft/library records.
