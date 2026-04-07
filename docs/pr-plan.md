# PR Plan — Drill-First IA and UX Cleanup

## Summary

This pass makes `/library` and top-level navigation explicitly drill-first while keeping portable package semantics available for technical import/export compatibility.

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

- Remove `Packages` from top-level navigation and primary IA.
- Make `New drill` the primary Library CTA and route directly to Studio with a newly created local draft.
- Keep import/export available as secondary drill workflow actions.
- Convert `/packages` into a compatibility redirect back to `/library`.
- Update docs to consistently describe drill-first UX and package-as-transport boundary.

## Follow-up candidates (not included)

- richer draft-to-drill promotion UX (rename/version prompts),
- bulk drill management actions,
- stronger linking model between promoted drills and later diverged drafts,
- automated migration for legacy mirrored draft/library records.
