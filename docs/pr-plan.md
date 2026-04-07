# PR Plan — Library/Studio Responsibility Cleanup

## Summary

This pass simplifies Studio into a focused editor workspace and moves drill file-management actions to Library so browsing/import/export are no longer duplicated in Studio.

## Assumptions

- Studio remains the web-first source of truth for drill authoring.
- Mobile runtime responsibilities stay in Android: <https://github.com/Voycepeh/CaliVision>.
- Local-first browser persistence (IndexedDB + localStorage metadata) remains required for resilience.
- Signed-in Library should present one account-first Drafts/My drills workflow without parallel local sections.
- Library is the canonical drill browsing + file-management route, and Studio edits the selected drill only.

## Non-goals

- no new hosted backend domains beyond existing auth + hosted drafts/library scope,
- no package contract/schema changes,
- no Android runtime behavior changes,
- no Drill Exchange backend implementation,
- no broad refactor of internal package-based type names.
- no developer-facing storage terminology in primary Library sections.
- no removal of existing editing capability; only responsibility relocation and UI de-cluttering.

## Scope

- Remove Studio's "Drill source" browsing surface and rely on Library for drill selection/opening.
- Keep Studio actions focused on editing (status, save draft, return to Library, compact overflow for optional publish prep).
- Move file-management actions (import/export/save copy/delete/open) to Library surfaces.
- Replace permanent Studio diagnostics side rail with an optional collapsible advanced section.
- Add a polished Studio empty state when no drill is selected, with CTA back to Library.
- Preserve local/hosted draft persistence behavior and autosave flows.

## Follow-up candidates (not included)

- wire final Android store URL and update CTA target,
- add polished rendered visuals/screens when available,
- add personalized/usage-aware homepage content,
- introduce optional Exchange spotlight modules once backed by hosted data.

## Hosted drafts foundation (April 2026)

Studio now supports a first real hosted slice with Supabase Auth + Postgres hosted drafts + Storage groundwork while preserving local-first IndexedDB drafts.

- Hosted drafts are private and user-owned.
- Public Drill Exchange retrieval/publishing remains deferred.
- Package-first authoring remains the core workflow.
- Android runtime responsibilities remain in https://github.com/Voycepeh/CaliVision.
