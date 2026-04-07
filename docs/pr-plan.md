# PR Plan — Drill-First IA Refresh on Main

## Summary

This pass simplifies Library persistence UX directly on top of current `main`, so storage mode is not exposed as a primary user concept and signed-in experience is account-first.

## Assumptions

- Studio remains the web-first source of truth for drill authoring.
- Mobile runtime responsibilities stay in Android: <https://github.com/Voycepeh/CaliVision>.
- Local-first browser persistence (IndexedDB + localStorage metadata) remains required for resilience.
- Signed-in Library should present one account-first Drafts/My drills workflow without parallel local sections.

## Non-goals

- no new hosted backend domains beyond existing auth + hosted drafts/library scope,
- no package contract/schema changes,
- no Android runtime behavior changes,
- no Drill Exchange backend implementation,
- no broad refactor of internal package-based type names.
- no developer-facing storage terminology in primary Library sections.

## Scope

- Keep Library focused on two user-facing concepts: Drafts and My drills.
- Signed out: show Drafts/My drills from browser-local persistence with clear local-device messaging.
- Signed in: show Drafts/My drills from hosted persistence as primary source of truth.
- Remove parallel primary sections like hosted drafts vs local drafts in signed-in mode.
- Add one-time local-draft import affordance after sign-in when local drafts exist.
- Preserve local safety fallback messaging when cloud save fails.
- Synchronize docs with the storage-agnostic UX model.

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
